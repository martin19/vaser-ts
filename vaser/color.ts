export class Color {
  r: number;
  g: number;
  b: number;
  a: number;

  constructor(r: number, g: number, b: number, a: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  static fromColor(C:Color) {
    return new Color(C.r, C.g, C.b, C.a);
  }

  static get(C:Color, index: number) {
    switch (index) {
      case 0:
        return C.r;
      case 1:
        return C.g;
      case 2:
        return C.b;
      default:
        return C.r;
    }
  }

  static set(C:Color, index: number, value:number) {
    switch (index) {
      case 0:
        C.r = value; break;
      case 1:
        C.g = value; break;
      case 2:
        C.b = value; break;
      default:
        C.r = value; break;
    }
  }

  static validRange(t: number) {
    return t >= 0.0 && t <= 1.0;
  }

  static between(A: Color, B: Color, t: number) {
    if (t < 0.0) t = 0.0;
    if (t > 1.0) t = 1.0;

    let kt = 1.0 - t;
    let C = new Color(A.r * kt + B.r * t,
      A.g * kt + B.g * t,
      A.b * kt + B.b * t,
      A.a * kt + B.a * t);

    return C;
  }

  static sRGBtolinear( C:Color, exact:boolean) {	//de-Gamma 2.2
    //from: http://www.xsi-blog.com/archives/133
    if (exact) {
      for ( let i=0; i<3; i++) {
        let cc = Color.get(C, i);

        if ( cc > 0.04045)
          cc = Math.pow( (cc+0.055)/1.055, 2.4);
        else
          cc /= 12.92;

        Color.set(C, i, cc);
      }
    } else {	//approximate
      for ( let i=0; i<3; i++) {
        let cc = Color.get(C, i);
        cc = Math.pow(cc,2.2);
        Color.set(C, i, cc);
      }
    }
  }

  static lineartosRGB( C:Color, exact:boolean) {	//Gamma 2.2
    if (exact) {
      for ( let i=0; i<3; i++) {
        let cc = Color.get( C,i);
        if ( cc > 0.0031308)
          cc = 1.055 * Math.pow(cc,1.0/2.4) - 0.055;
        else
          cc *= 12.92;
        Color.set(C, i, cc);
      }
    } else {	//approximate
      for ( let i=0; i<3; i++) {
        let cc = Color.get( C,i);
        cc = Math.pow(cc,1.0/2.2);
        Color.set(C, i, cc);
      }
    }
  }

  static max( r:number, g:number, b:number):number {
    return r>g? (g>b?r:(r>b?r:b)) : (g>b?g:b);
  }

  static min( r:number, g:number, b:number):number {
    return -Color.max( -r,-g,-b);
  }


  static RGBtoHSV(r: number, g: number, b: number):{ h : number, s : number, v : number } {	//from: http://www.cs.rit.edu/~ncs/color/t_convert.html
    let h, s, v;
    // r,g,b values are from 0 to 1
    // h = [0,360], s = [0,1], v = [0,1]
    //		if s == 0, then h = -1 (undefined)
    let min: number, max: number, delta: number;
    min = Color.min(r, g, b);
    max = Color.max(r, g, b);
    v = max;				// v
    delta = max - min;
    if (max != 0)
      s = delta / max;		// s
    else {
      // r = g = b = 0		// s = 0, v is undefined
      s = 0;
      h = -1;
      return {h, s, v};
    }
    if (r == max)
      h = (g - b) / delta;		// between yellow & magenta
    else if (g == max)
      h = 2 + (b - r) / delta;	// between cyan & yellow
    else
      h = 4 + (r - g) / delta;	// between magenta & cyan
    h *= 60;				// degrees
    if (h < 0)
      h += 360;

    return {h, s, v};
  }

  static HSVtoRGB(h: number, s: number, v: number): { r: number, g: number, b: number } {
    let r: number, g: number, b: number;
    let i: number;
    let f: number, p: number, q: number, t: number;
    if (s == 0) {
      // achromatic (grey)
      r = g = b = v;
      return {r, g, b};
    }
    h /= 60;			// sector 0 to 5
    i = Math.floor(h);
    f = h - i;			// factorial part of h
    p = v * (1 - s);
    q = v * (1 - s * f);
    t = v * (1 - s * (1 - f));
    switch (i) {
      case 0:
        r = v;
        g = t;
        b = p;
        break;
      case 1:
        r = q;
        g = v;
        b = p;
        break;
      case 2:
        r = p;
        g = v;
        b = t;
        break;
      case 3:
        r = p;
        g = q;
        b = v;
        break;
      case 4:
        r = t;
        g = p;
        b = v;
        break;
      default:		// case 5:
        r = v;
        g = p;
        b = q;
        break;
    }
    return {r, g, b};
  }

}
