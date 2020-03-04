import {vertexArrayHolder} from "./vertexArrayHolder";
import {Color} from "./color";
import {Point} from "./point";

export const vaser_min_alw=0.00000000001; //smallest value not regarded as zero
export const cri_segment_approx=1.6;
export const vaser_pi=3.141592653589793;
//for polyline_opt.joint
export const PLJ_miter =0; //default
export const PLJ_bevel =1;
export const PLJ_round =2;
//for polyline_opt.cap
export const PLC_butt  =0; //default
export const PLC_round =1;
export const PLC_square=2;
export const PLC_rect  =3;
export const PLC_both  =0; //default
export const PLC_first =10;
export const PLC_last  =20;
export const PLC_none  =30;

export interface tessellatorOpt {
  //set the whole structure to 0 will give default options
  triangulation:boolean;
  parts:number; //use TS_xx
  tessellate_only:boolean;
  holder:vertexArrayHolder; //used as (VASErin::vertex_array_holder*) if tessellate_only is true
}

export interface polyline_opt {
  //set the whole structure to 0 will give default options
  tess:tessellatorOpt;
  joint:number; //use PLJ_xx
  cap:number;   //use PLC_xx
  feather:boolean;
  feathering:number;
  no_feather_at_cap:boolean;
  no_feather_at_core:boolean;
}

export interface polyline_inopt
{
  const_color : boolean;
  const_weight : boolean;
  no_cap_first : boolean;
  no_cap_last : boolean;
  join_first : boolean;
  join_last : boolean;
  segment_length : number[]; //array of length of each segment
}

export interface st_anchor {
//the struct to hold memory for the working of anchor()
  P?:Point[]; //point [3]
  C?:Color[]; //color [3]
  W?:number[];//weight [3]

  cap_start?:Point;
  cap_end?:Point;
  SL?:st_polyline[]; //[3]
  vah?:vertexArrayHolder;
}

export interface st_knife_cut {
  T1:Point[]; //[4] retained polygon, also serves as input triangle
  C1:Color[]; //[4];

  T2:Point[]; //[4]; cut away polygon
  C2:Color[]; //[4];

  T1c:number;
  T2c:number; //count of T1 & T2
  //must be 0,3 or 4
}


export interface st_polyline {
//the struct to hold info for anchor_late() to perform triangluation
  //for all joints
  vP?:Point; //vector to intersection point
  vR?:Point; //fading vector at sharp end
  //all vP,vR are outward

  //for djoint==PLJ_bevel
  T?:Point; //core thickness of a line
  R?:Point; //fading edge of a line
  bR?:Point; //out stepping vector, same direction as cap
  T1?:Point;
  R1?:Point; //alternate vectors, same direction as T21
  //all T,R,T1,R1 are outward

  //for djoint==PLJ_round
  t?:number;
  r?:number;

  //for degeneration case
  degenT?:boolean; //core degenerated
  degenR?:boolean; //fade degenerated
  pre_full?:boolean; //draw the preceding segment in full
  PT?:Point;
  PR?:Point;
  pt?:number; //parameter at intersection
  R_full_degen?:boolean;

  djoint?:number; //determined joint
  // e.g. originally a joint is PLJ_miter. but it is smaller than critical angle, should then set djoint to PLJ_bevel
}

export function init_polyline_opt(): polyline_opt {
  return {
    cap: 0,
    feather: false,
    feathering: 0,
    joint: 0,
    no_feather_at_cap: false,
    no_feather_at_core: false,
    tess: {
      holder: null,
      parts: 0,
      tessellate_only: false,
      triangulation: false
    }
  }
}

export function init_colors(num : number):Color[] {
  let array = [];
  for(let i = 0; i < num; i++) array.push(new Color(0,0,0,0));
  return array;
}

export function init_points(num : number):Point[] {
  let array = [];
  for(let i = 0; i < num; i++) array.push(new Point(0,0));
  return array;
}

export function init_st_polyline():st_polyline {
  return {
    vP:new Point(0,0),
    vR:new Point(0,0),
    T:new Point(0,0),
    R:new Point(0,0),
    bR:new Point(0,0),
    T1:new Point(0,0),
    R1:new Point(0,0),
    t:0,
    r:0,
    degenT:false,
    degenR:false,
    pre_full:false,
    PT:new Point(0,0),
    PR:new Point(0,0),
    pt:0,
    R_full_degen:false,
    djoint:0
  }
}

export function init_st_anchor():st_anchor {
  return {
    P : [new Point(0,0), new Point(0,0), new Point(0,0)],
    C : [new Color(0,0,0,0),new Color(0,0,0,0),new Color(0,0,0,0),new Color(0,0,0,0)],
    W : [0,0,0],
    cap_start:new Point(0,0),
    cap_end:new Point(0,0),
    SL : [init_st_polyline(), init_st_polyline(), init_st_polyline()],
    vah : new vertexArrayHolder()
  }
}


export function init_st_knife_cut(): st_knife_cut {
  let T1 = [];
  let C1 = [];
  let T2 = [];
  let C2 = [];
  for(let i = 0; i < 4; i++) {
    T1.push(new Point(0,0));
    C1.push(new Color(0,0,0,0));
    T2.push(new Point(0,0));
    C2.push(new Color(0,0,0,0));
  }
  return {
    T1, C1, T2, C2, T2c : 0, T1c : 0
  }
}

