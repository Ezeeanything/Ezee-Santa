import { useEffect, useRef, useState } from 'react';
import { playPegTick } from '../utils/sound';

interface BlindedWheelProps {
  wedges: string[];
  spinning: boolean;
  targetWedgeIndex: number | null;
  muted: boolean;
  onSpinComplete?: () => void;
  size?: number;
  centerLabel?: string;
  idleSpin?: boolean;
}

const WEDGE_PALETTE = [
  { bg: '#0F4C3A', text: '#F8F7F4' }, // Deep pine
  { bg: '#F4F1EA', text: '#161A1D' }, // Warm ivory
  { bg: '#881337', text: '#F8F7F4' }, // Holiday burgundy
  { bg: '#B45309', text: '#F8F7F4' }, // Burnished amber
];

export function BlindedWheel({
  wedges,
  spinning,
  targetWedgeIndex,
  muted,
  onSpinComplete,
  size = 400,
  centerLabel = 'SEALED',
  idleSpin = false,
}: BlindedWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const angleRef = useRef<number>(0);
  const animRef = useRef<number | null>(null);
  const idleRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onSpinComplete);
  onCompleteRef.current = onSpinComplete;

  const [pointerKick, setPointerKick] = useState(false);
  const [landedIndex, setLandedIndex] = useState<number | null>(null);

  const displayWedges = wedges.length > 0 ? wedges : ['Waiting'];

  const renderWheelFrame = (
    ctx: CanvasRenderingContext2D,
    dpr: number,
    rotationRad: number,
    highlightIdx: number | null,
    activeGlow: boolean,
  ) => {
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const outerRadius = size / 2 - 14;
    const wheelRadius = outerRadius - 10;
    const count = displayWedges.length;
    const sliceAngle = (Math.PI * 2) / count;

    // Outer ambient ring
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius + 5, 0, Math.PI * 2);
    ctx.fillStyle = activeGlow ? 'rgba(194, 138, 46, 0.22)' : 'rgba(22, 26, 29, 0.06)';
    ctx.fill();

    // Brass/charcoal outer bezel
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#1E2421';
    ctx.fill();
    ctx.lineWidth = activeGlow ? 3 : 2;
    ctx.strokeStyle = activeGlow ? '#EAB308' : '#C28A2E';
    ctx.stroke();

    for (let i = 0; i < count; i++) {
      const startAngle = rotationRad + i * sliceAngle - Math.PI / 2;
      const endAngle = startAngle + sliceAngle;
      const palette =
        count === 1
          ? WEDGE_PALETTE[0]
          : count % 4 === 1 && i === count - 1
            ? WEDGE_PALETTE[2]
            : WEDGE_PALETTE[i % WEDGE_PALETTE.length];

      const isHighlighted = highlightIdx === i;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, wheelRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = wedges.length === 0 ? '#E6E3DC' : isHighlighted ? '#C28A2E' : palette.bg;
      ctx.fill();

      ctx.lineWidth = isHighlighted ? 2.5 : 1.5;
      ctx.strokeStyle = isHighlighted ? '#FFFFFF' : 'rgba(255, 255, 255, 0.28)';
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(startAngle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const fontSize = count > 18 ? 9.5 : count > 12 ? 11.5 : 13;
      ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle =
        wedges.length === 0 ? '#5C646B' : isHighlighted ? '#161A1D' : palette.text;
      const labelText = wedges.length === 0 ? 'OPEN SLOT' : displayWedges[i];
      ctx.fillText(labelText, wheelRadius - (count > 18 ? 14 : 18), 0);
      ctx.restore();
    }

    // Outer rim brass pegs
    const pegCount = Math.max(count, 8);
    const pegStep = (Math.PI * 2) / pegCount;
    for (let i = 0; i < pegCount; i++) {
      const pegAngle = rotationRad + i * pegStep - Math.PI / 2;
      const px = cx + Math.cos(pegAngle) * (outerRadius - 5);
      const py = cy + Math.sin(pegAngle) * (outerRadius - 5);
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#EAB308';
      ctx.fill();
    }

    // Center brass hub
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#C28A2E';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 27, 0, Math.PI * 2);
    ctx.fillStyle = '#0F4C3A';
    ctx.fill();

    ctx.fillStyle = '#F8F7F4';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(centerLabel, cx, cy);

    ctx.restore();
  };

  // Idle ambient rotation & initial draw
  useEffect(() => {
    if (spinning) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!idleSpin || prefersReducedMotion) {
      renderWheelFrame(ctx, dpr, angleRef.current, landedIndex, false);
      return;
    }

    let lastTime = performance.now();
    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      angleRef.current += dt * 0.28; // Gentle, steady rotation
      renderWheelFrame(ctx, dpr, angleRef.current, null, false);
      idleRef.current = requestAnimationFrame(loop);
    };

    idleRef.current = requestAnimationFrame(loop);
    return () => {
      if (idleRef.current !== null) {
        cancelAnimationFrame(idleRef.current);
      }
    };
  }, [displayWedges, size, wedges.length, centerLabel, idleSpin, spinning, landedIndex]);

  // Active ballot spin animation
  useEffect(() => {
    if (!spinning || targetWedgeIndex === null || displayWedges.length === 0) {
      return;
    }

    setLandedIndex(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const count = displayWedges.length;
    const sliceAngle = (Math.PI * 2) / count;
    const jitter = (Math.random() - 0.5) * sliceAngle * 0.4;
    const desiredMod =
      ((-targetWedgeIndex * sliceAngle - sliceAngle / 2 + jitter) % (Math.PI * 2) + Math.PI * 2) %
      (Math.PI * 2);

    const startAngle = angleRef.current;
    const currentMod = ((startAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let deltaMod = desiredMod - currentMod;
    if (deltaMod < 0) deltaMod += Math.PI * 2;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const extraSpins = prefersReducedMotion ? 1 : 7;
    const totalDelta = extraSpins * Math.PI * 2 + deltaMod;
    const endAngle = startAngle + totalDelta;
    const duration = prefersReducedMotion ? 400 : 4600;
    const startTime = performance.now();

    let lastPegIndex = Math.floor(startAngle / sliceAngle);
    let kickTimer: ReturnType<typeof setTimeout> | null = null;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const currentAngle = startAngle + totalDelta * eased;
      angleRef.current = currentAngle;

      const currentPegIndex = Math.floor(currentAngle / sliceAngle);
      if (currentPegIndex !== lastPegIndex && progress < 0.99) {
        lastPegIndex = currentPegIndex;
        playPegTick(muted);
        setPointerKick(true);
        if (kickTimer) clearTimeout(kickTimer);
        kickTimer = setTimeout(() => setPointerKick(false), 65);
      }

      renderWheelFrame(ctx, dpr, currentAngle, null, true);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        angleRef.current = endAngle;
        setPointerKick(false);
        setLandedIndex(targetWedgeIndex);
        renderWheelFrame(ctx, dpr, endAngle, targetWedgeIndex, true);
        setTimeout(() => {
          onCompleteRef.current?.();
        }, 550);
      }
    };

    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
      if (kickTimer) clearTimeout(kickTimer);
    };
  }, [spinning, targetWedgeIndex, displayWedges, muted, size, centerLabel]);

  return (
    <div className="relative inline-flex items-center justify-center select-none">
      {/* Top 12 o'clock brass pointer with tactile peg kick */}
      <div
        className={`absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 drop-shadow-sm transition-transform duration-75 origin-top ${
          pointerKick ? '-rotate-12' : 'rotate-0'
        }`}
        aria-hidden="true"
      >
        <svg width="36" height="36" viewBox="0 0 34 34" fill="none">
          <path
            d="M17 31L5 8.5C4.2 7 5.3 5 7 5H27C28.7 5 29.8 7 29 8.5L17 31Z"
            fill="#C28A2E"
            stroke="#161A1D"
            strokeWidth="2"
          />
          <circle cx="17" cy="11" r="3" fill="#F8F7F4" />
        </svg>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="max-w-full h-auto"
        aria-label={`Blinded ballot wheel with ${wedges.length} sealed slots`}
      />
    </div>
  );
}
