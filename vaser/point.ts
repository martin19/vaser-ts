import {vaser_min_alw} from "./vaserh";

export class Point {
  x : number;
  y : number;
  constructor(X:number, Y:number) {
    this.set(X,Y);
  }
  static fromPoint(p:Point) {
    return new Point(p.x, p.y);
  }
  set(X:number, Y:number) {
    this.x = X;
    this.y = Y;
  }
  length() {
    return Math.sqrt(this.x*this.x+this.y*this.y);
  }
  slope() {
    return this.y/this.x;
  }
  static signedArea(P1:Point, P2:Point, P3:Point) {
    return (P2.x-P1.x)*(P3.y-P1.y) - (P3.x-P1.x)*(P2.y-P1.y);
  }
  add(b:Point) {
    return new Point( this.x+b.x, this.y+b.y);
  }
  sub(b:Point) {
    return new Point( this.x-b.x, this.y-b.y);
  }
  mul(k:number) {
    return new Point( this.x*k, this.y*k);
  }
  div(k:number) {
    return new Point( this.x/k, this.y/k);
  }

  addTo(b:Point) {
    this.x += b.x;
    this.y += b.y;
  }
  subTo(b:Point) {
    this.x -= b.x;
    this.y -= b.y;
  }
  mulTo(k:number) {
    this.x *= k;
    this.y *= k;
  }
  divTo(k:number) {
    this.x /= k;
    this.y /= k;
  }
  static dot(a:Point, b:Point, o:Point) {
    o.x = a.x * b.x;
    o.y = a.y * b.y;
  }
  opposite() {
    this.x = -this.x;
    this.y = -this.y;
  }
  oppositeOf(a:Point) {
    this.x = -a.x;
    this.y = -a.y;
  }
  normalize() {
    let L = this.length();
    if ( L > vaser_min_alw) {
      this.x /= L; this.y /= L;
    }
    return L;
  }
  perpen() {//perpendicular: anti-clockwise 90 degrees
    let y_value=this.y;
    this.y=this.x;
    this.x=-y_value;
  }
  followSigns(a:Point) {
    if ( (this.x>0) != (a.x>0))	this.x = -this.x;
    if ( (this.y>0) != (a.y>0))	this.y = -this.y;
  }
  /*
  void follow_magnitude( const Point& a);
  void follow_direction( const Point& a);
  */
  static negligible(M:number):boolean {
    return -vaser_min_alw < M && M < vaser_min_alw;
  }

  negligible():boolean {
    return Point.negligible(this.x) && Point.negligible(this.y);
  }

  nonNegligible():boolean {
    return !this.negligible();
  }

  isZero():boolean {
    return this.x===0.0 && this.y===0.0;
  }

  nonZero():boolean {
    return !this.isZero();
  }

  static intersecting(A:Point, B:Point, C : Point, D:Point):boolean {	//return true if AB intersects CD
    return Point.signedArea(A,B,C)>0 != Point.signedArea(A,B,D)>0;
  }

  //operations require 2 input points
  static distanceSquared(A:Point, B:Point):number {
    let dx=A.x-B.x;
    let dy=A.y-B.y;
    return (dx*dx+dy*dy);
  }

  static distance(A:Point, B:Point):number {
    return Math.sqrt( Point.distanceSquared(A,B));
  }

  static midpoint(A:Point, B:Point):Point {
    return A.add(B).mul(0.5);
  }

  static oppositeQuadrant(P1: Point, P2: Point): boolean {
    let P1x = P1.x > 0 ? 1 : (P1.x < 0 ? -1 : 0);
    let P1y = P1.y > 0 ? 1 : (P1.y < 0 ? -1 : 0);
    let P2x = P2.x > 0 ? 1 : (P2.x < 0 ? -1 : 0);
    let P2y = P2.y > 0 ? 1 : (P2.y < 0 ? -1 : 0);

    if (P1x != P2x) {
      if (P1y != P2y)
        return true;
      if (P1y == 0 || P2y == 0)
        return true;
    }
    if (P1y != P2y) {
      if (P1x == 0 || P2x == 0)
        return true;
    }
    return false;
  }

  //operations of 3 points
  static anchorOutwardD(V:Point, b:Point, c:Point):boolean {
    return (b.x*V.x - c.x*V.x + b.y*V.y - c.y*V.y) > 0;
  }

  static anchorOutward(V:Point, b:Point, c:Point, reverse:boolean) { //put the correct outward vector at V, with V placed on b, comparing distances from c
    let determinant = Point.anchorOutwardD( V,b,c);
    if ( determinant === (!reverse)) { //when reverse==true, it means inward
      //positive V is the outward vector
      return false;
    } else {
      //negative V is the outward vector
      V.x=-V.x;
      V.y=-V.y;
      return true; //return whether V is changed
    }
  }

  static anchorInward(V:Point, b:Point, c:Point) {
    Point.anchorOutward( V,b,c,true);
  }

  //operations of 4 points
  static intersect(P1:Point, P2:Point, P3:Point, P4:Point) { //Determine the intersection point of two line segments
    let Pout:Point = new Point(0,0)
    let ua_out=0;
    let ub_out=0;
    let status : number;

    let mua:number,mub:number;
    let denom:number,numera:number,numerb:number;

    denom  = (P4.y-P3.y) * (P2.x-P1.x) - (P4.x-P3.x) * (P2.y-P1.y);
    numera = (P4.x-P3.x) * (P1.y-P3.y) - (P4.y-P3.y) * (P1.x-P3.x);
    numerb = (P2.x-P1.x) * (P1.y-P3.y) - (P2.y-P1.y) * (P1.x-P3.x);

    if( Point.negligible(numera) && Point.negligible(numerb) && Point.negligible(denom)) {
      Pout.x = (P1.x + P2.x) * 0.5;
      Pout.y = (P1.y + P2.y) * 0.5;
      return { status : 2, Pout, ua_out, ub_out }; //meaning the lines coincide
    }

    if ( Point.negligible(denom)) {
      Pout.x = 0;
      Pout.y = 0;
      return { status : 0, Pout, ua_out, ub_out };; //meaning lines are parallel
    }

    mua = numera / denom;
    mub = numerb / denom;
    ua_out = mua;
    ub_out = mub;

    Pout.x = P1.x + mua * (P2.x - P1.x);
    Pout.y = P1.y + mua * (P2.y - P1.y);

    let out1 = mua < 0 || mua > 1;
    let out2 = mub < 0 || mub > 1;

    if ( out1 && out2) {
      status = 5; //the intersection lies outside both segments
    } else if ( out1) {
      status = 3; //the intersection lies outside segment 1
    } else if ( out2) {
      status = 4; //the intersection lies outside segment 2
    } else {
      status = 1; //great
    }
    //http://paulbourke.net/geometry/lineline2d/

    return { status, Pout, ua_out, ub_out };
  }
}