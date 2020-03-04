import {Point} from "./point";
import {Color} from "./color";
import {
  cri_segment_approx, init_colors, init_points, init_polyline_opt, init_st_anchor, init_st_knife_cut, init_st_polyline,
  PLC_butt, PLC_first, PLC_last, PLC_none, PLC_rect,
  PLC_round,
  PLC_square,
  PLJ_bevel,
  PLJ_miter,
  PLJ_round, polyline_inopt,
  polyline_opt, st_anchor, st_knife_cut, st_polyline,
  vaser_min_alw,
  vaser_pi
} from "./vaserh";
import {vertexArrayHolder} from "./vertexArrayHolder";

function determine_t_r(w:number, t:number, R:number) {
  //efficiency: can cache one set of w,t,R values
  // i.e. when a polyline is of uniform thickness, the same w is passed in repeatedly
  const f = w - Math.trunc(w);

  if (w >= 0.0 && w < 1.0) {
    t = 0.05;
    R = 0.768;//R=0.48+0.32*f;
  } else if (w >= 1.0 && w < 2.0) {
    t = 0.05 + f * 0.33;
    R = 0.768 + 0.312 * f;
  } else if (w >= 2.0 && w < 3.0) {
    t = 0.38 + f * 0.58;
    R = 1.08;
  } else if (w >= 3.0 && w < 4.0) {
    t = 0.96 + f * 0.48;
    R = 1.08;
  } else if (w >= 4.0 && w < 5.0) {
    t = 1.44 + f * 0.46;
    R = 1.08;
  } else if (w >= 5.0 && w < 6.0) {
    t = 1.9 + f * 0.6;
    R = 1.08;
  } else if (w >= 6.0) {
    let ff = w - 6.0;
    t = 2.5 + ff * 0.50;
    R = 1.08;
  }

  return { t, R };
}

function get_PLJ_round_dangle(t: number, r: number) {
  let dangle: number;
  let sum: number = t + r;
  if (sum <= 1.44 + 1.08) //w<=4.0, feathering=1.0
    dangle = 0.6 / (t + r);
  else if (sum <= 3.25 + 1.08) //w<=6.5, feathering=1.0
    dangle = 2.8 / (t + r);
  else
    dangle = 4.2 / (t + r);
  return dangle;
}

function make_T_R_C(P1:Point, P2:Point, w:number, opt:polyline_opt, seg_mode:boolean) {
  let T:Point, R:Point, C:Point;
  let rr:number, tt:number, dist:number;
  let t=1.0;
  let r=0.0;
  let DP=P2.sub(P1);

  //calculate t,r
  let tr = determine_t_r(w, t, r);
  t = tr.t;
  r = tr.R;

  if ( opt.feather && !opt.no_feather_at_core && opt.feathering != 1.0) {
    r *= opt.feathering;
  } else if ( seg_mode) {
      //TODO: handle correctly for hori/vert segments in a polyline
    if ( Point.negligible(DP.x) && P1.x===Math.trunc(P1.x)) {
      if ( w>0.0 && w<=1.0) {
        t=0.5; r=0.0;
        P2.x = P1.x = Math.trunc(P1.x)+0.5;
      }
    } else if ( Point.negligible(DP.y) && P1.y===Math.trunc(P1.y)) {
      if ( w>0.0 && w<=1.0) {
        t=0.5; r=0.0;
        P2.y = P1.y = Math.trunc(P1.y)+0.5;
      }
    }
  }

  //output t,r
  tt = t;
  rr = r;

  //calculate T,R,C
  let len = DP.normalize();
  dist = len;
  C = Point.fromPoint(DP);
  DP.perpen();

  T = DP.mul(t);
  R = DP.mul(r);

  return { T, R, C, rr, tt, dist };
}

function same_side_of_line(V:Point, ref:Point, a:Point, b:Point) {
  let sign1 = Point.signedArea( a.add(ref),a,b);
  let sign2 = Point.signedArea( a.add(V),  a,b);
  if ( (sign1>=0) != (sign2>=0)) {
    V.opposite();
  }
}

function inner_arc( hold:vertexArrayHolder, P:Point, C:Color, C2:Color,
  dangle:number, angle1:number, angle2:number,
  r:number, r2:number, ignor_ends:boolean, apparent_P:Point|null)	//(apparent center) center of fan
//draw the inner arc between angle1 and angle2 with dangle at each step.
// -the arc has thickness, r is the outer radius and r2 is the inner radius,
//    with color C and C2 respectively.
//    in case when inner radius r2=0.0f, it gives a pie.
// -when ignor_ends=false, the two edges of the arc lie exactly on angle1
//    and angle2. when ignor_ends=true, the two edges of the arc do not touch
//    angle1 or angle2.
// -P is the mathematical center of the arc.
// -when apparent_P points to a valid Point (apparent_P != 0), r2 is ignored,
//    apparent_P is then the apparent origin of the pie.
// -the result is pushed to hold, in form of a triangle strip
// -an inner arc is an arc which is always shorter than or equal to a half circumference
{
  const m_pi = vaser_pi;
  let incremental=true;

  function INNER_ARC_PUSH(x : number, y : number) {
    hold.push( new Point(P.x+x*r,P.y-y*r), C);
	if ( !apparent_P)
      hold.push( new Point(P.x+x*r2,P.y-y*r2), C2);
    else
	  hold.push( apparent_P, C2);
  }


  if ( angle2 > angle1) {
    if ( angle2-angle1>m_pi) {
      angle2=angle2-2*m_pi;
    }
  } else {
    if ( angle1-angle2>m_pi) {
      angle1=angle1-2*m_pi;
    }
  }
  if ( angle1>angle2) {
    incremental = false; //means decremental
  }

  if ( incremental) {
    if ( ignor_ends) {
      let i=0;
      for ( let a=angle1+dangle; a<angle2; a+=dangle, i++) {
        let x=Math.cos(a);
        let y=Math.sin(a);

        INNER_ARC_PUSH(x,y);

        if ( i>100) {
          console.debug(`trapped in loop: inc,ig_end angle1=${angle1}, angle2=${angle2}, dangle=${dangle}`);
          break;
        }
      }
      //DEBUG( "steps=%d ",i); fflush(stdout);
    } else {
      let i=0;
      for ( let a=angle1; ; a+=dangle, i++) {
        if ( a>angle2) a=angle2;

        let x=Math.cos(a);
        let y=Math.sin(a);

        INNER_ARC_PUSH(x,y);

        if ( a>=angle2)
          break;

        if ( i>100) {
          console.debug(`trapped in loop: inc,end angle1=${angle1}, angle2=${angle2}, dangle=${dangle}`);
          break;
        }
      }
    }
  } else {//decremental
    if ( ignor_ends) {
      let i=0;
      for ( let a=angle1-dangle; a>angle2; a-=dangle, i++) {
        let x=Math.cos(a);
        let y=Math.sin(a);

        INNER_ARC_PUSH(x,y);

        if ( i>100) {
          console.debug(`trapped in loop: dec,ig_end angle1=${angle1}, angle2=${angle2}, dangle=${dangle}`);
          break;
        }
      }
    } else {
      let i=0;
      for ( let a=angle1; ; a-=dangle, i++) {
        if ( a<angle2)
          a=angle2;

        let x=Math.cos(a);
        let y=Math.sin(a);

        INNER_ARC_PUSH(x,y);

        if ( a<=angle2)
          break;

        if ( i>100) {
          console.debug(`trapped in loop: dec,end angle1=${angle1}, angle2=${angle2}, dangle=${dangle}`);
          break;
        }
      }
    }
  }
}

function vectors_to_arc( hold:vertexArrayHolder, P:Point, C:Color, C2:Color, A:Point, B:Point,
                         dangle:number, r:number, r2:number, ignor_ends:boolean, apparent_P:Point|null) {
//triangulate an inner arc between vectors A and B,
//  A and B are position vectors relative to P
  const m_pi = vaser_pi;
  A = A.mul(1/r);
  B = B.mul(1/r);
  if ( A.x > 1.0-vaser_min_alw) A.x = 1.0-vaser_min_alw;
  if ( A.x <-1.0+vaser_min_alw) A.x =-1.0+vaser_min_alw;
  if ( B.x > 1.0-vaser_min_alw) B.x = 1.0-vaser_min_alw;
  if ( B.x <-1.0+vaser_min_alw) B.x =-1.0+vaser_min_alw;

  let angle1 = Math.acos(A.x);
  let angle2 = Math.acos(B.x);
  if ( A.y>0){ angle1=2*m_pi-angle1;}
  if ( B.y>0){ angle2=2*m_pi-angle2;}

  inner_arc( hold, P, C,C2, dangle,angle1,angle2, r,r2, ignor_ends, apparent_P);
}

/*//#ifdef VASER_DEBUG
function annotate( P:Point, cc:Color, I:number, ctx:WebGLRenderingContext) {
  let i=0;
  if ( I != -1) i=I;

  ctx.glBegin(GL_LINES);
  glColor3f(1,0,0);
  glVertex2f(P.x-4,P.y-4);
  glVertex2f(P.x+4,P.y+4);
  glVertex2f(P.x-4,P.y+4);
  glVertex2f(P.x+4,P.y-4);
  glEnd();

  char str[10];
  sprintf(str,"%d",i);
  gl_font( FL_HELVETICA, 8);
  gl_draw( str,float(P.x+2),float(P.y));
  i++;
}
void annotate( const Point& P)
{
  Color cc;
  annotate(P,cc);
}
void draw_vector( const Point& P, const Point& V, const char* name)
{
  Point P2 = P+V;
  glBegin(GL_LINES);
  glColor3f(1,0,0);
  glVertex2f(P.x,P.y);
  glColor3f(1,0.9,0.9);
  glVertex2f(P2.x,P2.y);
  glEnd();
  if ( name)
  {
    glColor3f(0,0,0);
    gl_font( FL_HELVETICA, 8);
    gl_draw( name,float(P2.x+2),float(P2.y));
  }
}
void printpoint( const Point& P, const char* name)
{
  printf("%s(%.4f,%.4f) ",name,P.x,P.y);
  fflush(stdout);
}
#endif
*/

/*
Point plus_minus( const Point& a, const Point& b, bool plus)
{
	if (plus) return a+b;
	else return a-b;
}
Point plus_minus( const Point& a, bool plus)
{
	if (plus) return a;
	else return -a;
}
bool quad_is_reflexed( const Point& P0, const Point& P1, const Point& P2, const Point& P3)
{
	//points:
	//   1------3
	//  /      /
	// 0------2
	// vector 01 parallel to 23

	return Point::distance_squared(P1,P3) + Point::distance_squared(P0,P2)
		> Point::distance_squared(P0,P3) + Point::distance_squared(P1,P2);
}
void push_quad_safe( vertex_array_holder& core,
		const Point& P2, const Color& cc2, bool transparent2,
		const Point& P3, const Color& cc3, bool transparent3)
{
	//push 2 points to form a quad safely(without reflex)
	Point P0 = core.get_relative_end(-2);
	Point P1 = core.get_relative_end(-1);

	if ( !quad_is_reflexed(P0,P1,P2,P3))
	{
		core.push(P2,cc2,transparent2);
		core.push(P3,cc3,transparent3);
	}
	else
	{
		core.push(P3,cc3,transparent3);
		core.push(P2,cc2,transparent2);
	}
}*/

function push_quad_(line:number, core:vertexArrayHolder,
  P0:Point, P1:Point, P2:Point, P3:Point,
  c0:Color, c1:Color, c2:Color, c3:Color) {
  if( P0.isZero()) console.debug(`pushed P0 (0,0) at ${line}`);
  if( P1.isZero()) console.debug(`pushed P1 (0,0) at ${line}`);
  if( P2.isZero()) console.debug(`pushed P2 (0,0) at ${line}`);
  if( P3.isZero()) console.debug(`pushed P3 (0,0) at ${line}`);
  //interpret P0 to P3 as triangle strip
  core.push3( P0, P1, P2, c0, c1, c2);
  core.push3( P1, P2, P3, c1, c2, c3);
}

function push_quadf_( line:number, core:vertexArrayHolder,
                      P0:Point, P1:Point, P2:Point, P3:Point,
                      c0:Color, c1:Color, c2:Color, c3:Color,
                      trans0:boolean, trans1:boolean, trans2:boolean, trans3:boolean) {
  if( P0.isZero()) console.debug(`pushed P0 (0,0) at ${line}`);
  if( P1.isZero()) console.debug(`pushed P1 (0,0) at ${line}`);
  if( P2.isZero()) console.debug(`pushed P2 (0,0) at ${line}`);
  if( P3.isZero()) console.debug(`pushed P3 (0,0) at ${line}`);
  //interpret P0 to P3 as triangle strip
  core.push3( P0, P1, P2, c0, c1, c2, trans0, trans1, trans2);
  core.push3( P1, P2, P3, c1, c2, c3, trans1, trans2, trans3);
}

function triangle_knife_cut(kn1:Point, kn2:Point, kn_out:Point, //knife
  kC0:Color|null, kC1:Color|null, //color of knife
  ST:st_knife_cut)//will modify for output
//see knife_cut_test for more info
{	//return number of points cut away
  let points_cut_away = 0;

  let kn_colored = kC0 && kC1; //if true, use the colors of knife instead
  let std_sign = Point.signedArea( kn1,kn2,kn_out) > 0;
  let s1 = Point.signedArea( kn1,kn2,ST.T1[0])>0 == std_sign; //true means this point should be cut
  let s2 = Point.signedArea( kn1,kn2,ST.T1[1])>0 == std_sign;
  let s3 = Point.signedArea( kn1,kn2,ST.T1[2])>0 == std_sign;
  let sums = (s1?1:0) + (s2?1:0) + (s3?1:0);

  if ( sums === 0)
  {	//all 3 points are retained
    ST.T1c = 3;
    ST.T2c = 0;

    points_cut_away = 0;
  }
  else if ( sums === 3)
  {	//all 3 are cut away
    ST.T1c = 0;
    ST.T2c = 3;

    ST.T2[0] = ST.T1[0];
    ST.T2[1] = ST.T1[1];
    ST.T2[2] = ST.T1[2];
    ST.C2[0] = ST.C1[0];
    ST.C2[1] = ST.C1[1];
    ST.C2[2] = ST.C1[2];

    points_cut_away = 3;
  } else {
    if ( sums === 2) {
      s1 = !s1;
      s2 = !s2;
      s3 = !s3;
    }
    //
    let ip1:Point,ip2:Point, outp:Point;
    let iC1:Color,iC2:Color, outC:Color;
    if ( s1) { //here assume one point is cut away
      // thus only one of s1,s2,s3 is true
      outp= ST.T1[0];  outC= ST.C1[0];
      ip1 = ST.T1[1];  iC1 = ST.C1[1];
      ip2 = ST.T1[2];  iC2 = ST.C1[2];
    } else if ( s2) {
      outp= ST.T1[1];  outC= ST.C1[1];
      ip1 = ST.T1[0];  iC1 = ST.C1[0];
      ip2 = ST.T1[2];  iC2 = ST.C1[2];
    } else if ( s3) {
      outp= ST.T1[2];  outC= ST.C1[2];
      ip1 = ST.T1[0];  iC1 = ST.C1[0];
      ip2 = ST.T1[1];  iC2 = ST.C1[1];
    }

    let interP1:Point,interP2:Point;
    let interC1:Color,interC2:Color;
    let ble1:number,kne1:number, ble2:number,kne2:number;
    let i1 = Point.intersect( kn1, kn2, ip1, outp);
    let i2 = Point.intersect( kn1, kn2, ip2, outp);
    interP1 = i1.Pout;
    kne1 = i1.ua_out;
    ble1 = i1.ub_out;
    interP2 = i2.Pout;
    kne2 = i2.ua_out;
    ble2 = i2.ub_out;

    if ( kn_colored && Color.validRange(kne1))
      interC1 = Color.between( kC0, kC1, kne1);
    else
      interC1 = Color.between( iC1, outC, ble1);

    if ( kn_colored && Color.validRange(kne2))
      interC2 = Color.between( kC0, kC1, kne2);
    else
      interC2 = Color.between( iC2, outC, ble2);

    //ip2 first gives a polygon
    //ip1 first gives a triangle strip

    if ( sums === 1) {
      //one point is cut away
      ST.T1[0] = ip1;      ST.C1[0] = iC1;
      ST.T1[1] = ip2;      ST.C1[1] = iC2;
      ST.T1[2] = interP1;  ST.C1[2] = interC1;
      ST.T1[3] = interP2;  ST.C1[3] = interC2;
      ST.T1c = 4;

      ST.T2[0] = outp;     ST.C2[0] = outC;
      ST.T2[1] = interP1;  ST.C2[1] = interC1;
      ST.T2[2] = interP2;  ST.C2[2] = interC2;
      ST.T2c = 3;

      points_cut_away = 1;
    } else if ( sums === 2) {
      //two points are cut away
      ST.T2[0] = ip1;      ST.C2[0] = iC1;
      ST.T2[1] = ip2;      ST.C2[1] = iC2;
      ST.T2[2] = interP1;  ST.C2[2] = interC1;
      ST.T2[3] = interP2;  ST.C2[3] = interC2;
      ST.T2c = 4;

      ST.T1[0] = outp;     ST.C1[0] = outC;
      ST.T1[1] = interP1;  ST.C1[1] = interC1;
      ST.T1[2] = interP2;  ST.C1[2] = interC2;
      ST.T1c = 3;

      points_cut_away = 2;
    }

    /*if ( (0.0-vaser_min_alw < kne1 && kne1 < 1.0+vaser_min_alw) ||
         (0.0-vaser_min_alw < kne2 && kne2 < 1.0+vaser_min_alw) )
    {	//highlight the wound
        glBegin(GL_LINE_STRIP);
            glColor3f(1,0,0);
            glVertex2f(ST.T1[0].x,ST.T1[0].y);
            glVertex2f(ST.T1[1].x,ST.T1[1].y);
            glVertex2f(ST.T1[2].x,ST.T1[2].y);
            glVertex2f(ST.T1[0].x,ST.T1[0].y);
        glEnd();

        if ( ST.T1c > 3)
        glBegin(GL_LINE_STRIP);
            glVertex2f(ST.T1[1].x,ST.T1[1].y);
            glVertex2f(ST.T1[2].x,ST.T1[2].y);
            glVertex2f(ST.T1[3].x,ST.T1[3].y);
            glVertex2f(ST.T1[1].x,ST.T1[1].y);
        glEnd();
    }*/
  }

  return points_cut_away;
}

function vah_knife_cut( core:vertexArrayHolder, //serves as both input and output
kn1:Point, kn2:Point, kn_out:Point)
//perform knife cut on all triangles (GL_TRIANGLES) in core
{
  let ST:st_knife_cut = init_st_knife_cut();
  for ( let i=0; i<core.count; i+=3)
  {
    ST.T1[0] = core.get(i);
    ST.T1[1] = core.get(i+1);
    ST.T1[2] = core.get(i+2);
    ST.C1[0] = core.getColor(i);
    ST.C1[1] = core.getColor(i+1);
    ST.C1[2] = core.getColor(i+2);
    ST.T1c = 3; //will be ignored anyway

    let result = triangle_knife_cut( kn1,kn2,kn_out,null,null, ST);

    switch (result)
    {
      case 0:
        //do nothing
        break;

      case 3:	//degenerate the triangle
        core.move(i+1,i); //move i into i+1
        core.move(i+2,i);
        break;

      case 1:
      case 2:
        core.replace(i,  ST.T1[0],ST.C1[0]);
        core.replace(i+1,ST.T1[1],ST.C1[1]);
        core.replace(i+2,ST.T1[2],ST.C1[2]);

        if ( result==1) {	//create a new triangle
          let dump_P : Point = new Point(0,0);
          let dump_C : Color = new Color(0,0,0,0);
          let a1:number,a2:number,a3:number;
          a1 = core.push( dump_P, dump_C);
          a2 = core.push( dump_P, dump_C);
          a3 = core.push( dump_P, dump_C);

          //copy the original points
          core.move( a1, i+1);
          core.move( a2, i+2);
          core.move( a3, i+2);

          //make the new point
          core.replace( a3, ST.T1[3],ST.C1[3]);
        }
        break;

    }
  }
}

function vah_N_knife_cut( vahIn:vertexArrayHolder, vahOut:vertexArrayHolder,
kn0:Point, kn1:Point, kn2:Point,
kC0:Color|null, kC1:Color|null, N:number) {	//an iterative implementation
  let MAX_ST = 10;
  let ST:st_knife_cut[] = []; //[10]
  for(let i = 0; i < MAX_ST; i++) {
    ST.push({
      T1 : [new Point(0,0),new Point(0,0),new Point(0,0),new Point(0,0)],
      T2 : [new Point(0,0),new Point(0,0),new Point(0,0),new Point(0,0)],
      C1 : [new Color(0,0,0,0),new Color(0,0,0,0),new Color(0,0,0,0),new Color(0,0,0,0)],
      C2 : [new Color(0,0,0,0),new Color(0,0,0,0),new Color(0,0,0,0),new Color(0,0,0,0)],
      T1c : 0,
      T2c : 0
    })
  }


  let kn_colored:boolean = !!kC0 && !!kC1;

  if ( N > MAX_ST) {
    console.debug(`vah_N_knife_cut: max N for current build is ${MAX_ST}`);
    N = MAX_ST;
  }

  for ( let i=0; i<vahIn.count; i+=3) {//each input triangle
    let ST_count = 1;
    let st0:st_knife_cut;
    ST.push(st0);
    st0.T1 = [];
    st0.T1.push(vahIn.get(i));
    st0.T1.push(vahIn.get(i+1));
    st0.T1.push(vahIn.get(i+2));
    st0.C1 = [];
    st0.C1.push(vahIn.getColor(i));
    st0.C1.push(vahIn.getColor(i+1));
    st0.C1.push(vahIn.getColor(i+2));
    st0.T1c = 3;

    for ( let k=0; k<N; k++) //each knife
    {
      let cur_count = ST_count;
      for ( let p=0; p<cur_count; p++) //each triangle to be cut
      {
        //perform cut
        if ( ST[p].T1c > 0)
          if ( kn_colored)
            triangle_knife_cut( kn0[k], kn1[k], kn2[k], kC0[k],kC1[k], ST[p]);
          else
            triangle_knife_cut( kn0[k],kn1[k],kn2[k],null,null, ST[p]);

        //push retaining part
        if ( ST[p].T1c > 0) {
          vahOut.push( ST[p].T1[0], ST[p].C1[0]);
          vahOut.push( ST[p].T1[1], ST[p].C1[1]);
          vahOut.push( ST[p].T1[2], ST[p].C1[2]);
          if ( ST[p].T1c > 3) {
            vahOut.push( ST[p].T1[1], ST[p].C1[1]);
            vahOut.push( ST[p].T1[2], ST[p].C1[2]);
            vahOut.push( ST[p].T1[3], ST[p].C1[3]);
          }
        }

        //store cut away part to be cut again
        if ( ST[p].T2c > 0)
        {
          ST[p].T1[0] = ST[p].T2[0];
          ST[p].T1[1] = ST[p].T2[1];
          ST[p].T1[2] = ST[p].T2[2];
          ST[p].C1[0] = ST[p].C2[0];
          ST[p].C1[1] = ST[p].C2[1];
          ST[p].C1[2] = ST[p].C2[2];
          ST[p].T1c = 3;

          if ( ST[p].T2c > 3)
          {
            ST[ST_count].T1[0] = ST[p].T2[1];
            ST[ST_count].T1[1] = ST[p].T2[2];
            ST[ST_count].T1[2] = ST[p].T2[3];
            ST[ST_count].C1[0] = ST[p].C2[1];
            ST[ST_count].C1[1] = ST[p].C2[2];
            ST[ST_count].C1[2] = ST[p].C2[3];
            ST[ST_count].T1c = 3;
            ST_count++;
          }
        }
        else
        {
          ST[p].T1c = 0;
        }
      }
    }
  }
}

const cri_core_adapt:number = 0.0001;
function anchor_late( P:Point[], C:Color[], SL:st_polyline[], tris:vertexArrayHolder, cap1:Point, cap2:Point) {
  const size_of_P:number = 3;

  tris.setGLDrawMode(WebGLRenderingContext.TRIANGLES);

  let P_0:Point, P_1:Point, P_2:Point;
  P_0 = Point.fromPoint(P[0]);
  P_1 = Point.fromPoint(P[1]);
  P_2 = Point.fromPoint(P[2]);
  if ( SL[0].djoint==PLC_butt || SL[0].djoint==PLC_square)
    P_0.subTo(cap1);
  if ( SL[2].djoint==PLC_butt || SL[2].djoint==PLC_square)
    P_2.subTo(cap2);

  let P0:Point, P1:Point, P2:Point, P3:Point, P4:Point, P5:Point, P6:Point, P7:Point;
  let P0r:Point, P1r:Point, P2r:Point, P3r:Point, P4r:Point, P5r:Point, P6r:Point, P7r:Point; //fade

  P0 = P_1.add(SL[1].vP);
  P0r = P0.add(SL[1].vR);
  P1 = P_1.sub(SL[1].vP);
  P1r = P1.sub(SL[1].vR);

  P2 = P_1.add(SL[1].T1);
  P2r = P2.add(SL[1].R1).add(SL[0].bR);
  P3 = P_0.add(SL[0].T);
  P3r = P3.add(SL[0].R);
  P4 = P_0.sub(SL[0].T);
  P4r = P4.sub(SL[0].R);

  P5 = P_1.add(SL[1].T);
  P5r = P5.add(SL[1].R).sub(SL[1].bR);
  P6 = P_2.add(SL[2].T);
  P6r = P6.add(SL[2].R);
  P7 = P_2.sub(SL[2].T);
  P7r = P7.sub(SL[2].R);
  /* annotate( P0,C[0],0);
  annotate( P1);
  annotate( P2);
  annotate( P3);
  annotate( P4);
  annotate( P5);
  annotate( P6);
  annotate( P7); */

  let normal_line_core_joint = 1; //0:dont draw, 1:draw, 2:outer only

  //consider these as inline child functions
  function normal_first_segment() {
    tris.push3( P3,  P2,  P1, C[0],C[1],C[1]);
    tris.push3( P1,  P3,  P4, C[1],C[0],C[0]);
  }

  function normal_last_segment() {
    tris.push3( P1,  P5,  P6, C[1],C[1],C[2]);
	tris.push3( P1,  P6,  P7, C[1],C[2],C[2]);
  }

  let Cpt:Color; //color at PT
  if ( SL[1].degenT || SL[1].degenR) {
    let pt = Math.sqrt(SL[1].pt);
    if ( SL[1].pre_full)
      Cpt = Color.between(C[0],C[1], pt);
    else
      Cpt = Color.between(C[1],C[2], 1-pt);
  }

  if ( SL[1].degenT)
  {	//degen line core
    P1 = SL[1].PT;
    if( SL[1].degenR)
      P1r = SL[1].PR;

    tris.push3( P3,  P2,  P1, C[0],C[1],C[1]); //fir seg
    tris.push3( P1,  P5,  P6, C[1],C[1],C[2]); //las seg

    if ( SL[1].pre_full) {
      tris.push3( P1,  P3,  P4, C[1],C[0],C[0]);
    } else {
      tris.push3( P1,  P6,  P7, C[1],C[2],C[2]);
    }
  } else if ( SL[1].degenR && SL[1].pt > cri_core_adapt) //&& ! SL[1].degenT
  {	//line core adapted for degenR
    if ( SL[1].pre_full) {
      normal_last_segment();

      //special first segment
      let P9 : Point = SL[1].PT;
      tris.push3( P3,  P2,  P1,
        C[0],C[1],C[1]);
      tris.push3( P3,  P9,  P1,
        C[0], Cpt,C[1]);
      tris.push3( P3,  P9,  P4,
        C[0], Cpt,C[0]);
    } else {
      normal_first_segment();

      //special last segment
      let P9 : Point = SL[1].PT;
      push_quad_( 0, tris, P5,  P1,  P6,  P9, C[1],C[1],C[2], Cpt);
      tris.push3( P7,  P9,  P6,  C[2], Cpt,C[2]);
      /*annotate(P1,C[1],1);
      annotate(P5,C[1],5);
      annotate(P6,C[1],6);
      annotate(P7,C[1],7);
      annotate(P9,C[1],9);*/
    }
  } else {
    normal_first_segment();
    normal_last_segment();
  }

  if (normal_line_core_joint) {
    switch( SL[1].djoint) {
      case PLJ_miter:
        tris.push3( P2,  P5,  P0, C[1],C[1],C[1]);
      case PLJ_bevel:
        if ( normal_line_core_joint==1)
          tris.push3( P2,  P5,  P1, C[1],C[1],C[1]);
        break;

      case PLJ_round: {
        let strip:vertexArrayHolder = new vertexArrayHolder();
        strip.setGLDrawMode(WebGLRenderingContext.TRIANGLE_STRIP);

        if ( normal_line_core_joint==1)
          vectors_to_arc( strip, P_1, C[1], C[1], SL[1].T1, SL[1].T,
            get_PLJ_round_dangle(SL[1].t,SL[1].r),
            SL[1].t, 0.0, false, P1);
      else if ( normal_line_core_joint==2)
          vectors_to_arc( strip, P_1, C[1], C[1],
            SL[1].T1, SL[1].T,
            get_PLJ_round_dangle(SL[1].t,SL[1].r),
            SL[1].t, 0.0, false, P5);

        tris.pushVAH(strip);
      } break;
    }
  }

  if ( SL[1].degenR) {	//degen inner fade
    let P9:Point = SL[1].PT;
    let P9r:Point = SL[1].PR;
    //annotate(P9,C[0],9);
    //annotate(P9r);

    let ccpt:Color=Cpt;
    if ( SL[1].degenT)
      ccpt = C[1];

    if ( SL[1].pre_full) {
      push_quadf_( 0, tris, P9,  P4, P9r, P4r, ccpt,C[0],C[1],C[0], false,   false,   true,   true); //fir seg

      if ( !SL[1].degenT) {
        let mid:Point = Point.midpoint(P9,P7);
        tris.push3( P1,  P9, mid, C[1], Cpt,C[1],false,   false,   true);
        tris.push3( P1,  P7, mid, C[1],C[2],C[1],false,   false,   true);
      }
    } else {
      push_quadf_( 0, tris, P9,  P7, P9r, P7r, ccpt,C[2],C[1],C[2],false,   false,   true,   true); //las seg

      if ( !SL[1].degenT) {
        let mid:Point = Point.midpoint(P9,P4);
        tris.push3( P1,  P9, mid, C[1], Cpt,C[1],false,   false,   true);
        tris.push3( P1,  P4, mid, C[1],C[0],C[1],false,   false,   true);
      }
    }
  } else {	//normal inner fade
    push_quadf_(0, tris, P1,  P4, P1r, P4r, C[1],C[0],C[1],C[0],false,   false,   true,   true); //fir seg
    push_quadf_(0, tris, P1,  P7, P1r, P7r, C[1],C[2],C[1],C[2], false,   false,   true,   true); //las seg
  }

  {	//outer fade, whether degen or normal
    push_quadf_(0, tris, P2,  P3, P2r, P3r, C[1],C[0],C[1],C[0],false,   false,   true,   true); //fir seg
    push_quadf_(0, tris, P5,  P6, P5r, P6r, C[1],C[2],C[1],C[2],false,   false,   true,   true); //las seg
    switch( SL[1].djoint) {	//line fade joint
      case PLJ_miter:
        push_quadf_(0, tris, P0,  P5, P0r, P5r, C[1],C[1],C[1],C[1],false,   false,   true,   true);
        push_quadf_(0, tris, P0,  P2, P0r, P2r, C[1],C[1],C[1],C[1],false,   false,   true,   true);
        break;
      case PLJ_bevel:
        push_quadf_( 0, tris, P2,  P5, P2r, P5r, C[1],C[1],C[1],C[1],false,   false,   true,   true);
        break;
      case PLJ_round: {
        let strip:vertexArrayHolder = new vertexArrayHolder();
        strip.setGLDrawMode(WebGLRenderingContext.TRIANGLE_STRIP);
        let C2:Color = Color.fromColor(C[1]); C2.a = 0.0;
        vectors_to_arc( strip, P_1, C[1], C2,
          SL[1].T1, SL[1].T,
          get_PLJ_round_dangle(SL[1].t,SL[1].r),
          SL[1].t, SL[1].t+SL[1].r, false, null);

        tris.pushVAH(strip);
      } break;
    }
  }
} //anchor_late

function anchor_cap( P:Point[], C:Color[], SL:st_polyline[], tris:vertexArrayHolder, cap1:Point, cap2:Point) {
  let P4 = Point.fromPoint(P[0]).sub(SL[0].T);
  let P7 = Point.fromPoint(P[2]).sub(SL[2].T);
  for ( let i=0,k=0; k<=1; i=2, k++) {
    let cap:vertexArrayHolder = new vertexArrayHolder();
    let cur_cap:Point = i===0? cap1:cap2;
    if ( cur_cap.nonZero()) {
      cap.setGLDrawMode(WebGLRenderingContext.TRIANGLES);
      let perform_cut:boolean = ( SL[1].degenR && SL[1].R_full_degen) &&
      ((k==0 && !SL[1].pre_full) ||
        (k==1 &&  SL[1].pre_full) );

      let P3:Point = P[i].sub(SL[i].T.mul(2)).sub(SL[i].R).add(cur_cap);

      if ( SL[i].djoint === PLC_round) {	//round caps
        let strip:vertexArrayHolder = new vertexArrayHolder();
        strip.setGLDrawMode(WebGLRenderingContext.TRIANGLE_STRIP);

        let C2:Color = Color.fromColor(C[i]); C2.a = 0.0;
        let O:Point  = Point.fromPoint(P[i]);
        let app_P:Point = O.add(SL[i].T);
        let bR:Point = SL[i].bR;
        bR.followSigns(cur_cap);
        let dangle:number = get_PLJ_round_dangle(SL[i].t,SL[i].r);

        vectors_to_arc( strip, O, C[i], C[i],SL[i].T.add(bR), (SL[i].T.mul(-1)).add(bR), dangle, SL[i].t, 0.0, false, app_P);
        strip.push( O.sub(SL[i].T), C[i]);
        strip.push( app_P, C[i]);

        strip.jump();

        let a1:Point = O.add(SL[i].T);
        let a2:Point = O.add(SL[i].T.mul(1/SL[i].t).mul(SL[i].t+SL[i].r));
        let b1:Point = O.sub(SL[i].T);
        let b2:Point = O.sub(SL[i].T.mul(1/SL[i].t).mul(SL[i].t+SL[i].r));

        strip.push( a1,C[i]);
        strip.push( a2,C2);
        vectors_to_arc( strip, O, C[i], C2,SL[i].T.add(bR), (SL[i].T.mul(-1)).add(bR), dangle, SL[i].t, SL[i].t+SL[i].r, false, null);
        strip.push( b1,C[i]);
        strip.push( b2,C2);
        cap.pushVAH(strip);

        if ( perform_cut) {
          let P4k:Point;
          if ( !SL[1].pre_full)
            P4k = P7; //or P7r ?
          else
            P4k = P4;

          vah_knife_cut( cap, SL[1].PT, P4k, P3);
          /*annotate(SL[1].PT,C[i],0);
          annotate(P3,C[i],3);
          annotate(P4k,C[i],4);*/
        }
      } else {
        //rectangle caps
        let P_cur: Point = P[i];
        let degen_nxt = false, degen_las = false;
        if (k === 0)
          if (SL[0].djoint == PLC_butt || SL[0].djoint == PLC_square)
            P_cur.subTo(cap1);
        if (k === 1)
          if (SL[2].djoint == PLC_butt || SL[2].djoint == PLC_square)
            P_cur.subTo(cap2);

        let P0: Point, P1: Point, P2: Point, P3: Point, P4: Point, P5: Point, P6: Point;

        P0 = P_cur.add(SL[i].T).add(SL[i].R);
        P1 = P0.add(cur_cap);
        P2 = P_cur.add(SL[i].T);
        P4 = P_cur.sub(SL[i].T);
        P3 = P4.sub(SL[i].R).add(cur_cap);
        P5 = P4.sub(SL[i].R);

        cap.push(P0, C[i], true);
        cap.push(P1, C[i], true);
        cap.push(P2, C[i]);

        cap.push(P1, C[i], true);
        cap.push(P2, C[i]);
        cap.push(P3, C[i], true);

        cap.push(P2, C[i]);
        cap.push(P3, C[i], true);
        cap.push(P4, C[i]);

        cap.push(P3, C[i], true);
        cap.push(P4, C[i]);
        cap.push(P5, C[i], true);
        //say if you want to use triangle strip,
        //  just push P0~ P5 in sequence
        if (perform_cut) {
          vah_knife_cut(cap, SL[1].PT, SL[1].PR, P3);
          /*annotate(SL[1].PT,C[i],0);
          annotate(SL[1].PR);
          annotate(P3);
          annotate(P4);*/
        }
      }
    }
    tris.pushVAH(cap);
  }
} //anchor_cap

function segment_late( P:Point[], C:Color[], SL:st_polyline[], tris:vertexArrayHolder, cap1:Point, cap2:Point) {
  tris.setGLDrawMode(WebGLRenderingContext.TRIANGLES);

  let P_0:Point, P_1:Point, P_2:Point;
  P_0 = Point.fromPoint(P[0]);
  P_1 = Point.fromPoint(P[1]);
  if ( SL[0].djoint==PLC_butt || SL[0].djoint==PLC_square)
    P_0.subTo(cap1);
  if ( SL[1].djoint==PLC_butt || SL[1].djoint==PLC_square)
    P_1.subTo(cap2);

  let P1:Point, P2:Point, P3:Point, P4:Point;  //core
  let P1c:Point,P2c:Point,P3c:Point,P4c:Point; //cap
  let P1r:Point,P2r:Point,P3r:Point,P4r:Point; //fade

  P1 = P_0.add(SL[0].T);
  P1r = P1.add(SL[0].R);
  P1c = P1r.add(cap1);
  P2 = P_0.sub(SL[0].T);
  P2r = P2.sub(SL[0].R);
  P2c = P2r.add(cap1);
  P3 = P_1.add(SL[1].T);
  P3r = P3.add(SL[1].R);
  P3c = P3r.add(cap2);
  P4 = P_1.sub(SL[1].T);
  P4r = P4.sub(SL[1].R);
  P4c = P4r.add(cap2);
  //core
  push_quad_(0, tris, P1,  P2,  P3,  P4, C[0],C[0],C[1],C[1] );
  //fade
  push_quadf_(0, tris, P1, P1r,  P3, P3r, C[0],C[0],C[1],C[1],false,   true,   false,   true );
  push_quadf_( 0, tris, P2, P2r,  P4, P4r, C[0],C[0],C[1],C[1],false,   true,   false,   true );
  //caps
  for ( let j=0; j<2; j++) {
    let cap : vertexArrayHolder = new vertexArrayHolder();
    cap.setGLDrawMode(WebGLRenderingContext.TRIANGLE_STRIP);
    let cur_cap = j===0?cap1:cap2;
    if( cur_cap.isZero())
      continue;

    if ( SL[j].djoint === PLC_round) {	//round cap
      let C2:Color = Color.fromColor(C[j]); C2.a = 0.0;
      let O:Point  = Point.fromPoint(P[j]);
      let app_P:Point = O.add(SL[j].T);
      let bR:Point = SL[j].bR;
      bR.followSigns( j===0?cap1:cap2);
      let dangle:number = get_PLJ_round_dangle(SL[j].t,SL[j].r);

      vectors_to_arc( cap, O, C[j], C[j],SL[j].T.add(bR), SL[j].T.mul(-1).add(bR), dangle, SL[j].t, 0.0, false, app_P);
      cap.push( O.sub(SL[j].T),C[j]);
      cap.push( app_P, C[j]);

      cap.jump();

      //fade
      let a1:Point = O.add(SL[j].T);
      let a2:Point = O.add(SL[j].T.mul(1/SL[j].t).mul(SL[j].t+SL[j].r));
      let b1:Point = O.sub(SL[j].T);
      let b2:Point = O.sub(SL[j].T.mul(1/SL[j].t).mul(SL[j].t+SL[j].r));

      cap.push( a1,C[j]);
      cap.push( a2,C2);
      vectors_to_arc( cap, O, C[j], C2,SL[j].T.add(bR), SL[j].T.mul(-1).add(bR), dangle, SL[j].t, SL[j].t+SL[j].r, false, null);
      cap.push( b1,C[j]);
      cap.push( b2,C2);
    } else { //if ( SL[j].djoint == PLC_butt | SL[j].cap == PLC_square | SL[j].cap == PLC_rect)
      //rectangle cap
      let Pj:Point,Pjr:Point,Pjc:Point, Pk:Point,Pkr:Point,Pkc:Point;
      if ( j===0) {
        Pj = P1;
        Pjr= P1r;
        Pjc= P1c;

        Pk = P2;
        Pkr= P2r;
        Pkc= P2c;
      } else {
        Pj = P3;
        Pjr= P3r;
        Pjc= P3c;

        Pk = P4;
        Pkr= P4r;
        Pkc= P4c;
      }

      cap.push( Pkr, C[j], true);
      cap.push( Pkc, C[j], true);
      cap.push( Pk , C[j], false);
      cap.push( Pjc, C[j], true);
      cap.push( Pj , C[j], false);
      cap.push( Pjr, C[j], true);
    }
    tris.pushVAH(cap);
  }

  /*annotate(P1,C[0],1);
  annotate(P2,C[0],2);
  annotate(P3,C[0],3);
  annotate(P4,C[0],4);
      annotate(P1c,C[0],11);
      annotate(P2c,C[0],21);
      annotate(P3c,C[0],31);
      annotate(P4c,C[0],41);

      annotate(P1r,C[0],12);
      annotate(P2r,C[0],22);
      annotate(P3r,C[0],32);
      annotate(P4r,C[0],42);
  */
}


function segment(SA:st_anchor, options:polyline_opt|null, cap_first:boolean, cap_last:boolean, last_cap_type:number)
{
  let weight = SA.W;
  if ( !SA.P || !SA.C || !weight) return;

  let P:Point[] = init_points(2);
  P[0] = SA.P[0];
  P[1] = SA.P[1];
  let C:Color[] = init_colors(2);
  C[0] = SA.C[0];
  C[1] = SA.C[1];

  let opt:polyline_opt=init_polyline_opt();
  if ( options)
    opt = options;

  let T1:Point,T2:Point;
  let R1:Point,R2:Point;
  let bR:Point;
  let t:number,r:number;

  let varying_weight:boolean = !(weight[0]===weight[1]);

  let cap_start:Point = new Point(0,0), cap_end:Point = new Point(0,0);
  let SL : st_polyline[] = []; //[2]

  for ( let i=0; i<2; i++) {
    if ( weight[i]>=0.0 && weight[i]<1.0) {
      let f=weight[i]-Math.trunc(weight[i]);
      C[i].a *=f;
    }
  }

  {
    let i=0;
    let TRC1 = make_T_R_C( P[i], P[i+1], weight[i], opt, true);
    T2 = TRC1.T;
    R2 = TRC1.R;
    bR = TRC1.C;
    t = TRC1.tt;
    r = TRC1.rr;

    if ( cap_first) {
      if ( opt.cap===PLC_square) {
        P[0] = Point.fromPoint(P[0]).sub(bR.mul(t+r));
      }
      cap_start = Point.fromPoint(bR);
      cap_start.opposite();
      if ( opt.feather && !opt.no_feather_at_cap)
        cap_start.mulTo(opt.feathering);
    }

    SL.push({
      djoint:opt.cap,
      t:t,
      r:r,
      T:T2,
      R:R2,
      bR:bR.mul(0.01),
      degenT : false,
      degenR : false
    });
  }

  {
    let i=1;
    if ( varying_weight) {
      let TRC2 = make_T_R_C( P[i-1], P[i], weight[i],opt, true);
      T2 = TRC2.T;
      R2 = TRC2.R;
      bR = TRC2.C;
      t = TRC2.tt;
      r = TRC2.rr;
    }

    last_cap_type = last_cap_type === -1 ? opt.cap:last_cap_type;

    if ( cap_last) {
      if ( last_cap_type==PLC_square) {
        P[1] = Point.fromPoint(P[1]).add(bR.mul(t+r));
      }
      cap_end = Point.fromPoint(bR);
      if ( opt.feather && !opt.no_feather_at_cap)
        cap_end.mulTo(opt.feathering);
    }

    SL.push({
      djoint : last_cap_type,
      t:t,
      r:r,
      T:T2,
      R:R2,
      bR:bR.mul(0.01),
      degenT : false,
      degenR : false
    });

  }

  segment_late( P, C, SL , SA.vah, cap_start, cap_end);
}

function anchor(SA:st_anchor, options:polyline_opt, cap_first:boolean, cap_last:boolean):number {
  let opt:polyline_opt = init_polyline_opt();
  if ( options)
    opt = options;

  let P:Point[] = SA.P;
  let C:Color[] = SA.C;
  let weight:number[] = SA.W;

  //st_polyline emptySL;
  SA.SL = [init_st_polyline(),init_st_polyline(),init_st_polyline()];

  let SL = SA.SL;
  SA.vah.setGLDrawMode(WebGLRenderingContext.TRIANGLES);
  SA.cap_start = new Point(0,0);
  SA.cap_end = new Point(0,0);

  //const double critical_angle=11.6538;
  //	critical angle in degrees where a miter is force into bevel
  //	it is _similar_ to cairo_set_miter_limit () but cairo works with ratio while VASEr works with included angle
  const cos_cri_angle:number=0.979386; //cos(critical_angle)

  let varying_weight:boolean = !(weight[0]===weight[1] && weight[1]===weight[2]);

  let combined_weight:number = weight[1]+(opt.feather?opt.feathering:0.0);
  if ( combined_weight < cri_segment_approx) {
    segment( SA, opt, cap_first,false, opt.joint==PLJ_round?PLC_round:PLC_butt);
    let ori_cap:number = opt.cap;
    opt.cap = opt.joint==PLJ_round?PLC_round:PLC_butt;
    SA.P[0]=SA.P[1]; SA.P[1]=SA.P[2];
    SA.C[0]=SA.C[1]; SA.C[1]=SA.C[2];
    SA.W[0]=SA.W[1]; SA.W[1]=SA.W[2];
    segment( SA, opt, false, cap_last, ori_cap);
    return 0;
  }

  let T1:Point,T2:Point,T21:Point,T31:Point;		//]these are for calculations in early stage
  let R1:Point,R2:Point,R21:Point,R31:Point;		//]

  for ( let i=0; i<3; i++) {	//lower the transparency for weight < 1.0
    if ( weight[i]>=0.0 && weight[i]<1.0) {
      let f:number=weight[i];
      C[i].a *= f;
    }
  }

  {
    let i=0;

    let TRC1 = make_T_R_C( P[i], P[i+1], weight[i], opt, false);
    let T2 = TRC1.T;
    let R2 = TRC1.R;
    let cap1 = TRC1.C;
    let r = TRC1.rr;
    let t = TRC1.tt;

    if ( varying_weight) {
      let TRC2 = make_T_R_C( P[i], P[i+1], weight[i+1], opt, false);
      T31 = TRC2.T;
      R31 = TRC2.R;
    } else {
      T31 = T2;
      R31 = R2;
    }
    Point.anchorOutward(R2, P[i+1],P[i+2], false /*,inward_first->value()*/);
    T2.followSigns(R2);

    SL[i].bR=cap1;

    if ( cap_first) {
      if ( opt.cap==PLC_square) {
        P[0] = Point.fromPoint(P[0]).sub(cap1.mul(t+r));
      }
      cap1.opposite();
      if ( opt.feather && !opt.no_feather_at_cap) {
        cap1.mulTo(opt.feathering);
      }
      SA.cap_start = cap1;
    }

    SL[i].djoint=opt.cap;
    SL[i].T=Point.fromPoint(T2);
    SL[i].R=Point.fromPoint(R2);
    SL[i].t=t;
    SL[i].r=r;
    SL[i].degenT = false;
    SL[i].degenR = false;

    SL[i+1].T1=T31;
    SL[i+1].R1=R31;
  }

  if ( cap_last) {
    let i=2;

    let TRC = make_T_R_C( P[i-1],P[i], weight[i],opt, false);
    let cap2 = TRC.C;
    let r = TRC.rr;
    let t = TRC.tt;

    if ( opt.cap==PLC_square) {
      P[2] = Point.fromPoint(P[2]).add(cap2.mul(t+r));
    }

    SL[i].bR=cap2;

    if ( opt.feather && !opt.no_feather_at_cap)
      cap2.mul(opt.feathering);
    SA.cap_end = cap2;
  }

  {
    let i=1;

    let r:number,t:number;
    let P_cur:Point = P[i]; //current point //to avoid calling constructor repeatedly
    let P_nxt:Point = P[i+1]; //next point
    let P_las:Point = P[i-1]; //last point
    if ( opt.cap===PLC_butt || opt.cap===PLC_square) {
      P_nxt.subTo(SA.cap_end);
      P_las.subTo(SA.cap_start);
    }

    {
      let bR:Point;
      let length_cur:number, length_nxt:number;
      let TRC = make_T_R_C( P_las, P_cur,  weight[i-1], opt,false);
      T1 = TRC.T;
      R1 = TRC.R;
      length_cur = TRC.dist;

      if ( varying_weight) {
        let TRC = make_T_R_C( P_las, P_cur, weight[i], opt,  false);
        T21 = TRC.T;
        R21 = TRC.R;
      } else {
        T21 = Point.fromPoint(T1);
        R21 = Point.fromPoint(R1);
      }

      let TRC2 = make_T_R_C( P_cur, P_nxt,  weight[i], opt, false);
      T2 = TRC2.T;
      R2 = TRC2.R;
      bR = TRC2.C;
      r = TRC2.rr;
      t = TRC2.tt;
      length_nxt = TRC2.dist;

      if ( varying_weight) {
        let TRC = make_T_R_C( P_cur, P_nxt, weight[i+1],opt, false);
        T31 = TRC.T;
        R31 = TRC.R;
      } else {
        T31 = Point.fromPoint(T2);
        R31 = Point.fromPoint(R2);
      }

      SL[i].T=Point.fromPoint(T2);
      SL[i].R=Point.fromPoint(R2);
      SL[i].bR=Point.fromPoint(bR);
      SL[i].t=t;
      SL[i].r=r;
      SL[i].degenT = false;
      SL[i].degenR = false;

      SL[i+1].T1=Point.fromPoint(T31);
      SL[i+1].R1=Point.fromPoint(R31);
    }

    {	//2nd to 2nd last point

      //find the angle between the 2 line segments
      let ln1:Point,ln2:Point, V:Point = new Point(0,0);
      ln1 = P_cur.sub(P_las);
      ln2 = P_nxt.sub(P_cur);
      ln1.normalize();
      ln2.normalize();
      Point.dot(ln1,ln2, V);
      let cos_tho:number = -V.x-V.y;
      let zero_degree:boolean = Point.negligible(cos_tho-1);
      let d180_degree:boolean = cos_tho < -1+0.0001;
      let smaller_than_30_degree:boolean = cos_tho > 0.8660254;
      let result3:number = 1;

      if ( (cos_tho < 0 && opt.joint==PLJ_bevel) ||
        (opt.joint!=PLJ_bevel && opt.cap==PLC_round) ||
        (opt.joint==PLJ_round)
      ) {	//when greater than 90 degrees
        SL[i-1].bR.mulTo(0.01);
        SL[i]  .bR.mulTo(0.01);
        SL[i+1].bR.mulTo(0.01);
        //to solve an overdraw in bevel and round joint
      }

      Point.anchorOutward( T1, P_cur,P_nxt, false);
      R1.followSigns(T1);
      Point.anchorOutward( T21, P_cur,P_nxt, false);
      R21.followSigns(T21);
      SL[i].T1.followSigns(T21);
      SL[i].R1.followSigns(T21);
      Point.anchorOutward( T2, P_cur,P_las, false);
      R2.followSigns(T2);
      SL[i].T.followSigns(T2);
      SL[i].R.followSigns(T2);
      Point.anchorOutward( T31, P_cur,P_las, false);
      R31.followSigns(T31);

      { //must do intersection
        let vP:Point;
        let I0 = Point.intersect( P_las.add(T1), P_cur.add(T21),P_nxt.add(T31), P_cur.add(T2));
        let interP = I0.Pout;
        let result3 = I0.status;

        if ( result3) {
          vP = interP.sub(P_cur);
          SL[i].vP=vP;
          SL[i].vR=vP.mul(r/t);
        } else {
          SL[i].vP=SL[i].T;
          SL[i].vR=SL[i].R;
          console.debug( `intersection failed: cos(angle)=${cos_tho}, angle=${Math.acos(cos_tho)*180/3.14159}(degree)`);
        }
      }

      T1.opposite();		//]inward
      R1.opposite();
      T21.opposite();
      R21.opposite();
      T2.opposite();
      R2.opposite();
      T31.opposite();
      R31.opposite();

      //make intersections
      let PR1:Point,PR2:Point, PT1:Point,PT2:Point;
      /*let pt1:number,pt2:number;

      let I1 = Point.intersect( P_nxt.sub(T31).sub(R31), P_nxt.add(T31).add(R31),
        P_las.add(T1).add(R1), P_cur.add(T21).add(R21), //knife1
      );
      PR1 = I1.Pout;
      let result1r:number = I1.status; //fade

      let I2 = Point.intersect( P_las.sub(T1).sub(R1), P_las.add(T1).add(R1),
      P_nxt.add(T31).add(R31), P_cur.add(T2).add(R2), //knife2
      );
      PR2 = I2.Pout;
      let result2r:number = I2.status;
      */
      let pt1:number,pt2:number;

      let I1 = Point.intersect( P_nxt.sub(T31), P_nxt.add(T31),
        P_las.add(T1), P_cur.add(T21), //knife1
      );
      PR1 = I1.Pout;
      let result1r:number = I1.status; //fade

      let I2 = Point.intersect( P_las.sub(T1), P_las.add(T1),
        P_nxt.add(T31), P_cur.add(T2), //knife2
      );
      PR2 = I2.Pout;
      let result2r:number = I2.status;


      let is_result1r = result1r === 1;
      let is_result2r = result2r === 1;


      //
      let I3 = Point.intersect( P_nxt.sub(T31), P_nxt.add(T31),
        P_las.add(T1), P_cur.add(T21), //knife1_a
      ); //core
      PT1 = I3.Pout;
      pt1 = I3.ub_out;
      let result1t = I3.status;


      let I4 = Point.intersect( P_las.sub(T1), P_las.add(T1),
      P_nxt.add(T31), P_cur.add(T2), //knife2_a
      );
      PT2 = I4.Pout;
      pt2 = I4.ub_out;
      let result2t = I4.status;


      let is_result1t:boolean = result1t === 1;
      let is_result2t:boolean = result2t === 1;

      //
      let inner_sec:boolean = Point.intersecting( P_las.add(T1).add(R1), P_cur.add(T21).add(R21),P_nxt.add(T31).add(R31), P_cur.add(T2).add(R2));
      //
      if ( zero_degree) {
        let pre_full:boolean = is_result1t;
        opt.no_feather_at_cap=true;
        if ( pre_full) {
          segment( SA, opt, true, cap_last, opt.joint==PLJ_round?PLC_round:PLC_butt);
        } else {
          let ori_cap:number = opt.cap;
          opt.cap = opt.joint==PLJ_round?PLC_round:PLC_butt;
          SA.P[0]=SA.P[1]; SA.P[1]=SA.P[2];
          SA.C[0]=SA.C[1]; SA.C[1]=SA.C[2];
          SA.W[0]=SA.W[1]; SA.W[1]=SA.W[2];
          segment( SA, opt, true, cap_last, ori_cap);
        }
        return 0;
      }

      if ( (is_result1r || is_result2r) && !inner_sec) {	//fade degeneration
        SL[i].degenR=true;
        SL[i].PT = is_result1r? PT1:PT2; //this is is_result1r!!
        SL[i].PR = is_result1r? PR1:PR2;
        SL[i].pt = is_result1r? pt1:pt2;
        if ( SL[i].pt < 0)
          SL[i].pt = cri_core_adapt;
        SL[i].pre_full = is_result1r;
        SL[i].R_full_degen = false;

        let P_nxt:Point = P[i+1]; //override that in the parent scope
        let P_las:Point = P[i-1];
        let PR:Point;
        if ( opt.cap==PLC_rect || opt.cap==PLC_round) {
          P_nxt.addTo(SA.cap_end);
          P_las.addTo(SA.cap_start);
        }
        let result2:number;
        if ( is_result1r) {
          let I1 = Point.intersect( P_nxt.sub(T31).sub(R31), P_nxt.add(T31),P_las.add(T1).add(R1), P_cur.add(T21).add(R21)); //knife1
          PR = I1.Pout; 	//fade
          result2 = I1.status;
        } else {
          let I2 = Point.intersect( P_las.sub(T1).sub(R1), P_las.add(T1), P_nxt.add(T31).add(R31), P_cur.add(T2).add(R2)); //knife2
          PR = I2.Pout;
          result2 = I2.status;
        }
        if ( result2 == 1) {
          SL[i].R_full_degen = true;
          SL[i].PR = PR;
        }
      }

      if ( is_result1t || is_result2t) {	//core degeneration
        SL[i].degenT=true;
        SL[i].pre_full=is_result1t;
        SL[i].PT = is_result1t? PT1:PT2;
        SL[i].pt = is_result1t? pt1:pt2;
      } else {
        let PT1 : Point;
        let I = Point.intersect(P_nxt.sub(T31), P_nxt.add(T31), P_las, P_cur);
        PT1 = I.Pout;
        let result4 = I.status;
        if (result4 == 1) {
          SL[i].degenT = true;
          SL[i].pre_full = true;
          SL[i].PT = PT1;
        } else {
          let PT2 : Point;
          let I = Point.intersect(P_las.sub(T1), P_las.add(T1), P_cur, P_nxt);
          result4 = I.status;
          PT2 = I.Pout;

          if (result4 == 1) {
            SL[i].degenT = true;
            SL[i].pre_full = false;
            SL[i].PT = PT2;
          }
        }
      }

      //make joint
      SL[i].djoint = opt.joint;
      if ( opt.joint == PLJ_miter)
        if ( cos_tho >= cos_cri_angle)
          SL[i].djoint=PLJ_bevel;

      /*if ( varying_weight && smaller_than_30_degree)
      {	//not sure why, but it appears to solve a visual bug for varing weight
          Point interR,vR;
          char result3 = Point::intersect( P_las-T1-R1, P_cur-T21-R21,
                      P_nxt-T31-R31, P_cur-T2-R2,
                      interR);
          SL[i].vR = P_cur-interR-SL[i].vP;
          annotate(interR,C[i],9);
          draw_vector(P_las-T1-R1, P_cur-T21-R21 - P_las+T1+R1,"1");
          draw_vector(P_nxt-T31-R31, P_cur-T2-R2 - P_nxt+T31+R31,"2");
      }*/

      if ( d180_degree || !result3)
      {	//to solve visual bugs 3 and 1.1
        //efficiency: if color and weight is same as previous and next point
        // ,do not generate vertices
        same_side_of_line( SL[i].R, SL[i-1].R, P_cur,P_las);
        SL[i].T.followSigns(SL[i].R);
        SL[i].vP=SL[i].T;
        SL[i].T1.followSigns(SL[i].T);
        SL[i].R1.followSigns(SL[i].T);
        SL[i].vR=SL[i].R;
        SL[i].djoint=PLJ_miter;
      }
    } //2nd to 2nd last point
  }

  {
    let i=2;

    let r:number,t:number;
    let TRC = make_T_R_C( P[i-1],P[i], weight[i],opt, false);
    T2 = TRC.T;
    R2 = TRC.R;
    r = TRC.rr;
    t = TRC.tt;


    same_side_of_line( R2, SL[i-1].R, P[i-1],P[i]);
    T2.followSigns(R2);

    SL[i].djoint=opt.cap;
    SL[i].T=Point.fromPoint(T2);
    SL[i].R=Point.fromPoint(R2);
    SL[i].t=t;
    SL[i].r=r;
    SL[i].degenT = false;
    SL[i].degenR = false;
  }

  if( cap_first || cap_last) {
    anchor_cap( SA.P,SA.C, SA.SL,SA.vah, SA.cap_start,SA.cap_end);
  }
  anchor_late( SA.P,SA.C, SA.SL,SA.vah, SA.cap_start,SA.cap_end);
  return 1;
} //anchor

function poly_point_inter( P:Point[], C:Color[], W:number[], inopt:polyline_inopt|null, at:number, t:number):{p:Point, c:Color, w:number} {
  let pcw:{ p : Point, c : Color, w : number } = { p : new Point(0,0), c : new Color(0,0,0,0), w : 0};

  function color(I:number) { return C[inopt&&inopt.const_color?0:I]; }
  function weight(I:number) { return W[inopt&&inopt.const_weight?0:I]; }

  if( t==0.0) {
    pcw.p = P[at];
    pcw.c = color(at);
    pcw.w = weight(at);
  } else if( t==1.0) {
    pcw.p = P[at+1];
    pcw.c = color(at+1);
    pcw.w = weight(at+1);
  } else {
    pcw.p = (P[at].add(P[at+1])).mul(t);
    pcw.c = Color.between(color(at),color(at+1), t);
    pcw.w = (weight(at)+weight(at+1)) * t;
  }
  return pcw;
}

function polyline_approx(points:Point[], C:Color[], W:number[], length:number, opt:polyline_opt, inopt:polyline_inopt) {
  const P:Point[] = points;
  let cap_first:boolean = inopt? !inopt.no_cap_first :true;
  let cap_last:boolean =  inopt? !inopt.no_cap_last  :true;
  let seg_len=inopt? inopt.segment_length: 0;

  let SA1:st_anchor,SA2:st_anchor;
  let vcore:vertexArrayHolder = new vertexArrayHolder();  //curve core
  let vfadeo:vertexArrayHolder = new vertexArrayHolder(); //outer fade
  let vfadei:vertexArrayHolder = new vertexArrayHolder(); //inner fade
  vcore.setGLDrawMode(WebGLRenderingContext.TRIANGLE_STRIP);
  vfadeo.setGLDrawMode(WebGLRenderingContext.TRIANGLE_STRIP);
  vfadei.setGLDrawMode(WebGLRenderingContext.TRIANGLE_STRIP);

  if( length<2) return;

  function color(I:number) { return C[inopt&&inopt.const_color?0:I]; }
  function weight(I:number) { return W[inopt&&inopt.const_weight?0:I]; }

  for( let i=1; i<length-1; i++) {
    let t:number,r:number;
    let tr = determine_t_r(weight(i),t,r);
    t = tr.t;
    r = tr.R;

    if ( opt && opt.feather && !opt.no_feather_at_core) r*=opt.feathering;
    let V:Point=P[i].sub(P[i-1]);
    V.perpen();
    V.normalize();
    let F:Point=V.mul(r);
    V.mulTo(t);
    vcore.push( P[i].add(V),  color(i));
    vcore.push( P[i].sub(V),  color(i));
    vfadeo.push( P[i].add(V), color(i));
    vfadeo.push( P[i].add(V).add(F), color(i), true);
    vfadei.push( P[i].sub(V),   color(i));
    vfadei.push( P[i].sub(V).sub(F), color(i), true);
  }

  let P_las:Point,P_fir:Point;
  let C_las:Color,C_fir:Color;
  let W_las:number,W_fir:number;
  let pcw = poly_point_inter( P,C,W,inopt, length-2, 0.5);
  P_las = pcw.p;
  C_las = pcw.c;
  W_las = pcw.w;

  {
    let t:number,r:number;
    let tr = determine_t_r(W_las,t,r);
    t = tr.t;
    r = tr.R;

    if ( opt && opt.feather && !opt.no_feather_at_core) {
      r*=opt.feathering;
    }

    let V:Point=P[length-1].sub(P[length-2]);
    V.perpen();
    V.normalize();
    let F:Point=V.mul(r);
    V.mulTo(t);
    vcore.push( P_las.add(V), C_las);
    vcore.push( P_las.sub(V), C_las);
    vfadeo.push( P_las.add(V), C_las);
    vfadeo.push( P_las.add(V).add(F), C_las, true);
    vfadei.push( P_las.sub(V), C_las);
    vfadei.push( P_las.sub(V).sub(F), C_las, true);
  }

  //first caps
  {
    let pcw = poly_point_inter( P,C,W,inopt, 0, inopt&&inopt.join_first? 0.5:0.0);
    P_fir = pcw.p;
    C_fir = pcw.c;
    W_fir = pcw.w;

    SA1.P[0] = P_fir;
    SA1.P[1] = P[1];
    SA1.C[0] = C_fir;
    SA1.C[1] = color(1);
    SA1.W[0] = W_fir;
    SA1.W[1] = weight(1);
    segment( SA1, opt, cap_first,false, -1);
  }
  //last cap
  if( !(inopt&&inopt.join_last))
  {
    SA2.P[0] = P_las;
    SA2.P[1] = P[length-1];
    SA2.C[0] = C_las;
    SA2.C[1] = color(length-1);
    SA2.W[0] = W_las;
    SA2.W[1] = weight(length-1);
    segment( SA2, opt, false,cap_last, -1);
  }

  if( opt && opt.tess && opt.tess.tessellate_only && opt.tess.holder) {
    let holder = opt.tess.holder;
    holder.pushVAH(vcore);
    holder.pushVAH(vfadeo);
    holder.pushVAH(vfadei);
    holder.pushVAH(SA1.vah);
    holder.pushVAH(SA2.vah);
  } else {
    // vcore.draw();
    // vfadeo.draw();
    // vfadei.draw();
    // SA1.vah.draw();
    // SA2.vah.draw();
  }

  if ( opt && opt.tess && opt.tess.triangulation) {
    // vcore.draw_triangles();
    // vfadeo.draw_triangles();
    // vfadei.draw_triangles();
    // SA1.vah.draw_triangles();
    // SA2.vah.draw_triangles();
  }
}

function polyline_exact(P:Point[], C:Color[], W:number[], size_of_P:number, opt:polyline_opt, inopt:polyline_inopt) {
  let cap_first:boolean = inopt? !inopt.no_cap_first :true;
  let cap_last:boolean =  inopt? !inopt.no_cap_last  :true;
  let join_first :boolean = inopt && inopt.join_first;
  let join_last :boolean =  inopt && inopt.join_last;

  function color(I:number) { return C[inopt&&inopt.const_color?0:I]; }
  function weight(I:number) { return W[inopt&&inopt.const_weight?0:I]; }

  let mid_l:Point, mid_n:Point; //the last and the next mid point
  let c_l:Color, c_n:Color;
  let w_l:number, w_n:number;
  {	//init for the first anchor
    let pcw = poly_point_inter( P,C,W,inopt, 0, join_first?0.5:0);
    mid_l = pcw.p;
    c_l = pcw.c;
    w_l = pcw.w;
  }

  let SA:st_anchor = init_st_anchor();
  if ( size_of_P == 2) {
    SA.P[0] = P[0];
    SA.P[1] = P[1];
    SA.C[0] = color(0);
    SA.C[1] = color(1);
    SA.W[0] = weight(0);
    SA.W[1] = weight(1);
    segment( SA, opt, cap_first, cap_last, -1);
  } else {
    for (let i = 1; i < size_of_P - 1; i++) {
      if (i == size_of_P - 2 && !join_last) {
        let pcw = poly_point_inter(P, C, W, inopt, i, 1.0);
        mid_n = pcw.p;
        c_n = pcw.c;
        w_n = pcw.w;

      } else {
        let pcw = poly_point_inter(P, C, W, inopt, i, 0.5);
        mid_n = pcw.p;
        c_n = pcw.c;
        w_n = pcw.w;
      }

      SA.P[0] = mid_l;
      SA.C[0] = c_l;
      SA.W[0] = w_l;
      SA.P[2] = mid_n;
      SA.C[2] = c_n;
      SA.W[2] = w_n;

      SA.P[1] = P[i];
      SA.C[1] = color(i);
      SA.W[1] = weight(i);

      anchor(SA, opt, i == 1 && cap_first, i == size_of_P - 2 && cap_last);

      mid_l = mid_n;
      c_l = c_n;
      w_l = w_n;
    }
  }
  //draw or not
  if( opt && opt.tess && opt.tess.tessellate_only && opt.tess.holder) {
    opt.tess.holder.pushVAH(SA.vah);
  } else {
    //SA.vah.draw();
  }
  //draw triangles
  if( opt && opt.tess && opt.tess.triangulation) {
    //SA.vah.draw_triangles();
  }
}

function polyline_range(P:Point[], C:Color[], W:number[], length:number, opt:polyline_opt, in_options:polyline_inopt|null, from:number, to:number, approx:boolean) {
  let inopt:polyline_inopt= {
    const_weight:false,
    const_color:false,
    join_first:false,
    join_last:false,
    no_cap_first:false,
    no_cap_last:false,
    segment_length:[]
  } ;
  if( in_options)
    inopt=in_options;
  if( from>0) from-=1;
  inopt.join_first = from!=0;
  inopt.join_last = to!=(length-1);
  inopt.no_cap_first = inopt.no_cap_first || inopt.join_first;
  inopt.no_cap_last = inopt.no_cap_last || inopt.join_last;

  if( approx) {
    polyline_approx( P.splice(from), C.splice(inopt.const_color?0:from), W.splice(inopt.const_weight?0:from), to-from+1, opt, inopt);
  } else {
    polyline_exact ( P.splice(from), C.splice(inopt.const_color?0:from), W.splice(inopt.const_weight?0:from), to-from+1, opt, inopt);
  }
}

export function polyline(
  PP:Point[],  //pointer to array of point of a polyline
  C:Color[],  //array of color
  W:number[], //array of weight
  length:number, //size of the buffer P
  options:polyline_opt|null, //options
  in_options:polyline_inopt|null) //internal options
{
  let opt:polyline_opt = {
    cap : 0,
    feather : false,
    feathering : 0,
    joint : 0,
    no_feather_at_cap : false,
    no_feather_at_core : false,
    tess : {
      holder : null,
      parts : 0,
      tessellate_only : false,
      triangulation : false
    }
  };
  let inopt:polyline_inopt= {
    const_weight:false,
    const_color:false,
    join_first:false,
    join_last:false,
    no_cap_first:false,
    no_cap_last:false,
    segment_length:[]
  } ;
  if( options) opt=options;
  if( in_options) inopt=in_options;

  if( opt.cap >= 10) {
    let dec=(opt.cap/10)*10;
    if( dec==PLC_first || dec==PLC_none)
      inopt.no_cap_last=true;
    if( dec==PLC_last || dec==PLC_none)
      inopt.no_cap_first=true;
    opt.cap -= dec;
  }

  if( inopt.const_weight && W[0] < cri_segment_approx) {
    polyline_exact(PP,C,W,length,opt,inopt);
    return;
  }

  let P=PP;
  let A=0,B=0;
  let on=false;
  for( let i=1; i<length-1; i++)
  {
    let V1:Point=P[i].sub(P[i-1]);
    let V2:Point=P[i+1].sub(P[i]);
    let len=0.0;
    if( inopt.segment_length) {
      V1.divTo(inopt.segment_length[i]);
      V2.divTo(inopt.segment_length[i+1]);
      len += (inopt.segment_length[i]+inopt.segment_length[i+1])*0.5;
    } else {
      len += V1.normalize()*0.5;
      len += V2.normalize()*0.5;
    }
    let costho = V1.x*V2.x+V1.y*V2.y;
    //double angle = acos(costho)*180/vaser_pi;
    const cos_a:number = Math.cos(15*vaser_pi/180);
    const cos_b:number = Math.cos(10*vaser_pi/180);
    const cos_c:number = Math.cos(25*vaser_pi/180);
    let weight = W[inopt.const_weight?0:i];
    let approx = false;
    if( (weight<7 && costho>cos_a) ||
      (costho>cos_b) || //when the angle difference at an anchor is smaller than a critical degree, do polyline approximation
      (len<weight && costho>cos_c) ) //when vector length is smaller than weight, do approximation
      approx = true;
    if( approx && !on) {
      A=i; if( A==1) A=0;
      on=true;
      if( A>1)
        polyline_range(PP,C,W,length,opt,inopt,B,A,false);
    } else if( !approx && on) {
      B=i;
      on=false;
      polyline_range(PP,C,W,length,opt,inopt,A,B,true);
    }
  }
  if( on && B<length-1) {
    B=length-1;
    polyline_range(PP,C,W,length,opt,inopt,A,B,true);
  } else if( !on && A<length-1) {
    A=length-1;
    polyline_range(PP,C,W,length,opt,inopt,B,A,false);
  }
}