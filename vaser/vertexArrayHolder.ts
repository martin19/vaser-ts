import {Point} from "./point";
import {Color} from "./color";

export class vertexArrayHolder {
  count:number; //counter
  glmode:number; //drawing mode in opengl
  jumping:boolean;
  vert:number[]; //because it holds 2d vectors
  color:number[]; //RGBA


  constructor() {
    this.count = 0;
    this.glmode = WebGLRenderingContext.TRIANGLES;
    this.jumping = false;
    this.vert = [];
    this.color = [];
  }

  setGLDrawMode(mode:number) {
    this.glmode = mode;
  }

  clear() {
    this.count = 0;
  }

  move( a:number, b:number) { //move b into a
    this.vert[a*2]   = this.vert[b*2];
    this.vert[a*2+1] = this.vert[b*2+1];

    this.color[a*4]  = this.color[b*4];
    this.color[a*4+1]= this.color[b*4+1];
    this.color[a*4+2]= this.color[b*4+2];
    this.color[a*4+3]= this.color[b*4+3];
  }

  replace( a:number, P:Point, C:Color) {
    this.vert[a*2]   = P.x;
    this.vert[a*2+1] = P.y;

    this.color[a*4]  = C.r;
    this.color[a*4+1]= C.g;
    this.color[a*4+2]= C.b;
    this.color[a*4+3]= C.a;
  }

  /* int draw_and_flush()
	{
		int& i = count;
		draw();
		switch( glmode)
		{
			case GL_POINTS:
				i=0;
			break;

			case GL_LINES:
				if ( i%2 == 0) {
					i=0;
				} else {
					goto copy_the_last_point;
				}
			break;

			case GL_TRIANGLES:
				if ( i%3 == 0) {
					i=0;
				} else if ( i%3 == 1) {
					goto copy_the_last_point;
				} else {
					goto copy_the_last_2_points;
				}
			break;

			case GL_LINE_STRIP: case GL_LINE_LOOP:
			//for line loop it is not correct
			copy_the_last_point:
				move(0,MAX_VERT-1);
				i=1;
			break;

			case GL_TRIANGLE_STRIP:
			copy_the_last_2_points:
				move(0,MAX_VERT-2);
				move(1,MAX_VERT-1);
				i=2;
			break;

			case GL_TRIANGLE_FAN:
				//retain the first point,
				// and copy the last point
				move(1,MAX_VERT-1);
				i=2;
			break;

			case GL_QUAD_STRIP:
			case GL_QUADS:
			case GL_POLYGON:
			//let it be and I cannot help
				i=0;
			break;
		}
		if ( i == MAX_VERT) //as a double check
			i=0;
	}*/

  push( P:Point, cc:Color, trans?:boolean) {
    let cur = this.count;
    this.vert.push(P.x);
    this.vert.push(P.y);
    this.color.push(cc.r);
    this.color.push(cc.g);
    this.color.push(cc.b);
    this.color.push(trans?0.0:cc.a);

    this.count++;
    if ( this.jumping) {
      this.jumping=false;
      this.repeatLastPush();
    }
    return cur;
  }

  push3( P1:Point, P2:Point, P3:Point, C1:Color, C2:Color, C3:Color,
    trans1?:boolean, trans2?:boolean, trans3?:boolean) {
    this.push( P1,C1,trans1);
    this.push( P2,C2,trans2);
    this.push( P3,C3,trans3);
  }

  pushVAH( hold:vertexArrayHolder) {
    if ( this.glmode == hold.glmode) {
      this.count += hold.count;
      this.vert = this.vert.concat(hold.vert);
      this.color = this.color.concat(hold.color);
    } else if ( this.glmode == WebGLRenderingContext.TRIANGLES && hold.glmode == WebGLRenderingContext.TRIANGLE_STRIP) {
      for (let b=2; b < hold.count; b++) {
          for ( let k=0; k<3; k++, this.count++) {
          let B = b-2 + k;
          this.vert.push(hold.vert[B*2]);
          this.vert.push(hold.vert[B*2+1]);
          this.color.push(hold.color[B*4]);
          this.color.push(hold.color[B*4+1]);
          this.color.push(hold.color[B*4+2]);
          this.color.push(hold.color[B*4+3]);
        }
      }
    } else {
      throw "vertex_array_holder:push: unknown type\n";
    }
  }

  get(i:number):Point {
    return new Point(this.vert[i*2], this.vert[i*2+1]);
  }

  getColor(b:number) {
    return new Color(this.color[b*4],this.color[b*4+1],this.color[b*4+2], this.color[b*4+3]);
  }

  getRelativeEnd(di:number) {	//di=-1 is the last one
    let i = this.count+di;
    if ( i<0) i=0;
    if ( i>=this.count) i=this.count-1;
    return this.get(i);
  }

  repeatLastPush() {
    let P = new Point(0,0);
    let cc = new Color(0,0, 0,0);

    let i = this.count-1;

    P.x = this.vert[i*2];
    P.y = this.vert[i*2+1];
    cc.r = this.color[i*4];
    cc.g = this.color[i*4+1];
    cc.b = this.color[i*4+2];
    cc.a = this.color[i*4+3];

    this.push(P,cc, false);
  }

  jump() { //to make a jump in triangle strip by degenerated triangles
    if ( this.glmode == WebGLRenderingContext.TRIANGLE_STRIP) {
      this.repeatLastPush();
      this.jumping=true;
    }
  }

  // void draw()
  // {
  //   backend::vah_draw(*this);
  // }

  drawTriangles() {
    let col = new Color(1 , 0, 0, 0.5);
    if ( this.glmode == WebGLRenderingContext.TRIANGLES) {
      for ( let i=0; i<this.count; i++) {
        let P:Point[] = [];
        P.push(this.get(i)); i++;
        P.push(this.get(i)); i++;
        P.push(this.get(i));
        P.push(P[0]);
        //polyline((Vec2*)P,col,1.0,4,0);
      }
    }
    else if ( this.glmode == WebGLRenderingContext.TRIANGLE_STRIP) {
      for ( let i=2; i<this.count; i++) {
        let P :Point[] =[];
        P.push(this.get(i-2));
        P.push(this.get(i));
        P.push(this.get(i-1));
        //polyline((Vec2*)P,col,1.0,3,0);
      }
    }
  }

  swap(B:vertexArrayHolder) {
    let hold_count=this.count;
    let hold_glmode=this.glmode;
    let hold_jumping=this.jumping;
    this.count = B.count;
    this.glmode = B.glmode;
    this.jumping = B.jumping;
    B.count = hold_count;
    B.glmode = hold_glmode;
    B.jumping = hold_jumping;
    let Cvert = this.vert;
    this.vert = B.vert;
    B.vert = Cvert;
    let Ccolor = this.color;
    this.color = B.color;
    B.color = Ccolor;
  }


  debugTriangles(ctx : CanvasRenderingContext2D) {
    let col = new Color(1 , 0, 0, 0.5);
    if ( this.glmode == WebGLRenderingContext.TRIANGLES) {
      for ( let i=0; i<this.count; i++) {
        let P:Point[] = [];
        P.push(this.get(i)); i++;
        P.push(this.get(i)); i++;
        P.push(this.get(i));
        P.push(P[0]);

        ctx.moveTo(P[0].x,P[0].y);
        ctx.lineTo(P[1].x,P[1].y);
        ctx.lineTo(P[2].x,P[2].y);
        ctx.lineTo(P[0].x,P[0].y);
        ctx.stroke();
      }
    }
    else if ( this.glmode == WebGLRenderingContext.TRIANGLE_STRIP) {
      for ( let i=2; i<this.count; i++) {
        let P :Point[] =[];
        P.push(this.get(i-2));
        P.push(this.get(i));
        P.push(this.get(i-1));

        ctx.moveTo(P[0].x,P[0].y);
        ctx.lineTo(P[1].x,P[1].y);
        ctx.lineTo(P[2].x,P[2].y);
        ctx.lineTo(P[0].x,P[0].y);
        ctx.stroke();

      }
    }
  }
}