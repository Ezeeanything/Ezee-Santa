import { useEffect, useRef } from 'react';

interface ConfettiBurstProps {
  active: boolean;
  onComplete?: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rotation: number;
  vRot: number;
  tiltPhase: number;
  vTilt: number;
  opacity: number;
  shape: 'rect' | 'ribbon';
}

const CONFETTI_COLORS = [
  '#0F4C3A', // Deep evergreen
  '#C28A2E', // Burnished gold
  '#EAB308', // Warm gold
  '#881337', // Holiday burgundy
  '#15803D', // Pine accent
  '#EFECE6', // Warm ivory
];

export function ConfettiBurst({ active, onComplete }: ConfettiBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      onCompleteRef.current?.();
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const particles: Particle[] = [];
    const totalParticles = 120;

    for (let i = 0; i < totalParticles; i++) {
      // Launch from center-upper viewport & dual side cannons for balanced celebration
      const originRoll = i % 3;
      const startX =
        originRoll === 0
          ? width * 0.5 + (Math.random() - 0.5) * 140
          : originRoll === 1
            ? width * 0.25 + (Math.random() - 0.5) * 80
            : width * 0.75 + (Math.random() - 0.5) * 80;
      const startY = originRoll === 0 ? height * 0.36 : height * 0.52;

      const angle =
        originRoll === 0
          ? -Math.PI / 2 + (Math.random() - 0.5) * 1.8
          : originRoll === 1
            ? -Math.PI / 3 + (Math.random() - 0.5) * 0.9
            : (-2 * Math.PI) / 3 + (Math.random() - 0.5) * 0.9;

      const speed = 6 + Math.random() * 10;

      particles.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        w: 6 + Math.random() * 5,
        h: 4 + Math.random() * 4,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.18,
        tiltPhase: Math.random() * Math.PI * 2,
        vTilt: 0.08 + Math.random() * 0.12,
        opacity: 1,
        shape: i % 4 === 0 ? 'ribbon' : 'rect',
      });
    }

    let frameId: number | null = null;
    const startTime = performance.now();
    const duration = 3400;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const fadeStart = 2100;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      let alive = 0;
      for (const p of particles) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.24; // Gentle gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vRot;
        p.tiltPhase += p.vTilt;

        if (elapsed > fadeStart) {
          p.opacity = Math.max(0, 1 - (elapsed - fadeStart) / (duration - fadeStart));
        }

        if (p.opacity <= 0.01 || p.y > height + 40) {
          continue;
        }
        alive++;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.scale(1, Math.cos(p.tiltPhase));
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;

        if (p.shape === 'ribbon') {
          ctx.fillRect(-p.w * 0.7, -p.h * 0.35, p.w * 1.4, p.h * 0.7);
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }

      ctx.restore();

      if (elapsed < duration && alive > 0) {
        frameId = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onCompleteRef.current?.();
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-50"
    />
  );
}
