"use client";

import { useEffect, useRef } from "react";

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0,1);}`;

const FRAG = `precision highp float;
uniform vec2 u_res;
uniform float u_time;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.0;float a=0.5;
  for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=0.5;}
  return v;
}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  vec2 p=(gl_FragCoord.xy-0.5*u_res)/u_res.y;
  float t=u_time*0.07;
  float n=fbm(p*2.2+vec2(t*0.55,t*0.32));
  float n2=fbm(p*3.4-vec2(t*0.38,-t*0.46));
  float fold=sin((p.x*1.35-p.y*0.95+n*1.7+t)*3.14159);
  float silk=smoothstep(0.12,0.96,0.5+0.5*fold)*(0.32+n2*0.68);
  float sweep=p.x*0.28+p.y*0.82-sin(t*0.65)*0.5;
  float beam=pow(max(1.0-abs(sweep)*1.15,0.0),16.0);
  float vig=smoothstep(1.2,0.22,length(p*vec2(0.72,1.0)));
  vec3 bg=vec3(0.024,0.031,0.042);
  vec3 mint=vec3(0.502,0.965,0.737);
  vec3 steel=vec3(0.38,0.5,0.82);
  vec3 col=bg;
  col+=steel*n*0.11*vig;
  col+=mint*silk*0.24*vig;
  col+=mint*beam*0.58*vig;
  col+=vec3(0.86,0.9,1.0)*beam*0.14;
  vec2 g=gl_FragCoord.xy/20.0;
  float dots=smoothstep(0.11,0.07,length(fract(g)-0.5))*0.065*vig;
  col+=vec3(0.72,0.8,0.92)*dots;
  col+=vec3(0.95,0.97,1.0)*smoothstep(0.08,0.0,uv.y)*0.07;
  gl_FragColor=vec4(col,1.0);
}`;

export function LoginStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const start = performance.now();

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const pw = Math.max(1, Math.floor(w * dpr));
      const ph = Math.max(1, Math.floor(h * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      gl.viewport(0, 0, pw, ph);
      gl.uniform2f(uRes, pw, ph);
    };

    const draw = (now: number) => {
      fit();
      gl.uniform1f(uTime, reduce ? 2.4 : (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(() => {
      if (reduce) draw(start);
    });
    ro.observe(canvas);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <div className="login-frame">
      <canvas ref={canvasRef} className="login-frame-canvas" aria-hidden />
      <div className="login-frame-shine" />
    </div>
  );
}
