import { useState, useEffect, FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  Eye,
  EyeOff,
  Gift,
  Lock,
  RotateCw,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  MatchDetails,
  PublicParticipant,
  PublicStateResponse,
  SpinOptionsResponse,
  SpinResultResponse,
} from '../types';
import { BlindedWheel } from './BlindedWheel';
import { ConfettiBurst } from './ConfettiBurst';
import { playRevealChime } from '../utils/sound';

interface SpinBoothViewProps {
  state: PublicStateResponse;
  lockedFirstName: string | null;
  activeSession: { firstName: string; pin: string } | null;
  onUnlockSession: (participant: PublicParticipant, pin: string) => void;
  onNotify: (title: string, description?: string, variant?: 'success' | 'info') => void;
  onStateRefresh: () => Promise<void>;
  onGoToSignUp: () => void;
  onGoToMatch: () => void;
}

export function SpinBoothView({
  state,
  lockedFirstName,
  activeSession,
  onUnlockSession,
  onNotify,
  onStateRefresh,
  onGoToSignUp,
  onGoToMatch,
}: SpinBoothViewProps) {
  const [firstNameInput, setFirstNameInput] = useState<string>(
    lockedFirstName || activeSession?.firstName || '',
  );
  const [pinInput, setPinInput] = useState<string>(activeSession?.pin || '');
  const [showPin, setShowPin] = useState(false);

  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [alreadySpunNotice, setAlreadySpunNotice] = useState(false);

  const [spinOptions, setSpinOptions] = useState<SpinOptionsResponse | null>(null);
  const [muted, setMuted] = useState(false);

  const [spinning, setSpinning] = useState(false);
  const [targetWedgeIndex, setTargetWedgeIndex] = useState<number | null>(null);
  const [pendingMatch, setPendingMatch] = useState<MatchDetails | null>(null);
  const [revealedMatch, setRevealedMatch] = useState<MatchDetails | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [privacyHidden, setPrivacyHidden] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);

  useEffect(() => {
    if (lockedFirstName) {
      setFirstNameInput(lockedFirstName);
    }
  }, [lockedFirstName]);

  useEffect(() => {
    if (!activeSession) {
      setSpinOptions(null);
      return;
    }

    let cancelled = false;
    const loadOptions = async () => {
      try {
        const res = await fetch('/api/spin-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: activeSession.firstName,
            pin: activeSession.pin,
          }),
        });
        const data = await res.json();
        if (!cancelled && res.ok) {
          setSpinOptions(data as SpinOptionsResponse);
          setFirstNameInput(activeSession.firstName);
          setPinInput(activeSession.pin);
          setAlreadySpunNotice(false);
        } else if (!cancelled && res.status === 409) {
          setAlreadySpunNotice(true);
        }
      } catch {
        // User can manually unlock below
      }
    };
    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [activeSession]);

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    setAlreadySpunNotice(false);

    const effectiveName = (lockedFirstName || firstNameInput).trim();
    const trimmedPin = pinInput.trim();
    if (effectiveName.length < 2) {
      setUnlockError('Please enter your first name.');
      return;
    }
    if (!/^\d{4}$/.test(trimmedPin)) {
      setUnlockError('Enter the 4-digit secret PIN you created during sign-up.');
      return;
    }

    setUnlocking(true);
    try {
      const res = await fetch('/api/spin-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: effectiveName,
          pin: trimmedPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setAlreadySpunNotice(true);
        }
        setUnlockError(data.error || 'Could not unlock your spin booth.');
        return;
      }

      setSpinOptions(data as SpinOptionsResponse);
      setRevealedMatch(null);
      setPendingMatch(null);
      setTargetWedgeIndex(null);
      onUnlockSession(data.participant, trimmedPin);
    } catch {
      setUnlockError('Network error while verifying PIN.');
    } finally {
      setUnlocking(false);
    }
  };

  const handleSpin = async () => {
    if (!spinOptions || spinning) return;
    setSpinError(null);

    if (spinOptions.eligibleCount === 0) {
      setSpinError('No eligible colleagues remain on the wheel.');
      return;
    }

    const activePin = activeSession?.pin || pinInput.trim();
    try {
      const res = await fetch('/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: spinOptions.participant.id,
          pin: activePin,
        }),
      });
      const data = (await res.json()) as SpinResultResponse & { error?: string };
      if (!res.ok) {
        setSpinError(data.error || 'Spin failed. Please try again.');
        return;
      }

      setPendingMatch(data.match);
      setTargetWedgeIndex(data.targetWedgeIndex);
      setSpinning(true);
    } catch {
      setSpinError('Network error while executing spin.');
    }
  };

  const handleWheelLanded = async () => {
    setSpinning(false);
    if (pendingMatch) {
      setRevealedMatch(pendingMatch);
      setPendingMatch(null);
      setPrivacyHidden(false);
      setShowConfetti(true);
      playRevealChime(muted);
      onNotify(
        'Ballot spin complete',
        'Your Secret Santa match has been unsealed privately.',
      );
      await onStateRefresh();
    }
  };

  // Revealed state right after spinning
  if (revealedMatch && spinOptions) {
    return (
      <>
        <ConfettiBurst active={showConfetti} onComplete={() => setShowConfetti(false)} />
        <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-3xl mx-auto bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-10 space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E3DC] pb-5">
          <div>
            <p className="text-xs font-medium text-[#0F4C3A]">
              Ballot Sealed &amp; Confirmed · {spinOptions.participant.firstName}
            </p>
            <h1 className="mt-1 text-3xl sm:text-4xl font-bold text-[#161A1D]">
              Your Secret Santa Match Is Ready
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setPrivacyHidden((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium border border-[#D6D3CB] rounded-lg text-[#161A1D] hover:bg-[#F8F7F4] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {privacyHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>{privacyHidden ? 'Reveal Match' : 'Hide Screen'}</span>
          </button>
        </div>

        {privacyHidden ? (
          <div className="py-12 text-center border border-[#E5E3DC] rounded-xl bg-[#F8F7F4] space-y-3">
            <Lock className="w-7 h-7 text-[#5C646B] mx-auto" />
            <p className="text-base font-medium text-[#161A1D]">Match Hidden for Privacy</p>
            <p className="text-sm text-[#5C646B]">
              Click &ldquo;Reveal Match&rdquo; above when nobody is looking over your shoulder.
            </p>
          </div>
        ) : (
          <div className="border border-[#0F4C3A]/20 bg-[#0F4C3A]/[0.03] rounded-xl p-6 sm:p-8 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[#5C646B]">You are gifting</p>
                <p className="mt-1 text-4xl sm:text-5xl font-bold text-[#0F4C3A] font-display">
                  {revealedMatch.firstName}
                </p>
              </div>
              <div className="w-11 h-11 rounded-lg bg-[#0F4C3A] text-white flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5" />
              </div>
            </div>

            <div className="border-t border-[#E5E3DC] pt-4">
              <p className="text-xs font-medium text-[#5C646B]">Gift Hint (Optional)</p>
              <p className="mt-1 text-sm text-[#161A1D] leading-relaxed">
                {revealedMatch.giftHint
                  ? revealedMatch.giftHint
                  : 'No gift hint provided—feel free to surprise them!'}
              </p>
            </div>
          </div>
        )}

        <div className="bg-[#F8F7F4] border border-[#E5E3DC] rounded-lg p-4 text-sm text-[#5C646B] space-y-1">
          <p className="text-[#161A1D] font-medium">Wheel Updated Automatically</p>
          <p>
            {privacyHidden ? 'Your match' : revealedMatch.firstName} has been removed from the
            spinning wheel so nobody else can draw them. Your own name (
            {spinOptions.participant.firstName}) remains on the wheel until another colleague draws
            you.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <p className="text-xs text-[#5C646B] tabular-nums">
            {state.stats.remainingOnWheel} sealed ballots remaining on the office wheel
          </p>
          <button
            type="button"
            onClick={onGoToMatch}
            className="px-4 py-2 text-sm font-medium bg-[#0F4C3A] text-white rounded-lg hover:bg-[#0B3A2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Go to My Match
          </button>
        </div>
      </motion.div>
      </>
    );
  }

  // Not yet unlocked: Private First Name + PIN Verification
  if (!spinOptions) {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-8 space-y-6">
        <div>
          <p className="text-xs font-medium text-[#5C646B]">Private Spin Booth</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold text-[#161A1D]">
            Enter Your Name &amp; PIN to Spin
          </h1>
          <p className="mt-2 text-sm text-[#5C646B]">
            {lockedFirstName
              ? `Signed in as ${lockedFirstName}. Enter your 4-digit PIN to open your blinded ballot wheel.`
              : 'Type your registered first name and 4-digit secret PIN to load your blinded ballot wheel.'}
          </p>
        </div>

        <form onSubmit={handleUnlock} className="space-y-5">
          <div>
            <label htmlFor="spin-name-input" className="block text-sm font-medium text-[#161A1D]">
              First Name
            </label>
            <div className="relative mt-1.5">
              <input
                id="spin-name-input"
                type="text"
                required
                readOnly={Boolean(lockedFirstName)}
                autoComplete="off"
                maxLength={40}
                value={lockedFirstName || firstNameInput}
                onChange={(e) => {
                  if (lockedFirstName) return;
                  setFirstNameInput(e.target.value);
                  setUnlockError(null);
                }}
                placeholder="Type your registered first name"
                className={`w-full px-3.5 py-2.5 text-sm border border-[#D6D3CB] rounded-lg text-[#161A1D] placeholder:text-[#8A9199] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/20 focus:border-[#0F4C3A] ${
                  lockedFirstName ? 'bg-[#F3F2EE] pr-10 cursor-not-allowed' : 'bg-white'
                }`}
              />
              {lockedFirstName && (
                <Lock
                  className="w-4 h-4 text-[#5C646B] absolute right-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
              )}
            </div>
            {lockedFirstName && (
              <p className="mt-1.5 text-xs text-[#5C646B]">
                Locked to {lockedFirstName} on this browser.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="spin-pin-input" className="block text-sm font-medium text-[#161A1D]">
              4-Digit Secret PIN
            </label>
            <div className="relative mt-1.5">
              <input
                id="spin-pin-input"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={4}
                required
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="Enter your 4-digit PIN"
                className="w-full px-3.5 py-2.5 pr-10 font-mono text-sm tracking-widest bg-white border border-[#D6D3CB] rounded-lg text-[#161A1D] placeholder:text-[#8A9199] placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/20 focus:border-[#0F4C3A]"
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#5C646B] hover:text-[#161A1D] cursor-pointer"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {unlockError && (
            <div
              role="alert"
              className="border border-[#991B1B]/30 bg-[#991B1B]/[0.05] rounded-lg px-4 py-3 text-sm text-[#991B1B]"
            >
              {unlockError}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-1">
            {alreadySpunNotice ? (
              <button
                type="button"
                onClick={onGoToMatch}
                className="text-sm font-medium text-[#0F4C3A] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open My Match
              </button>
            ) : !lockedFirstName ? (
              <button
                type="button"
                onClick={onGoToSignUp}
                className="text-sm font-medium text-[#5C646B] hover:text-[#161A1D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Need to sign up first?
              </button>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={unlocking}
              className="px-6 py-2.5 text-sm font-medium bg-[#0F4C3A] text-white rounded-lg hover:bg-[#0B3A2C] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {unlocking ? 'Verifying...' : 'Unlock Spin Wheel'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // Unlocked Spin Booth
  const canSpin = spinOptions.eligibleCount > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-8">
      <div className="lg:col-span-5 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-medium text-[#0F4C3A]">
            Unlocked · {spinOptions.participant.firstName}
          </span>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute wheel sound' : 'Mute wheel sound'}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5C646B] hover:text-[#161A1D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{muted ? 'Muted' : 'Sound On'}</span>
          </button>
        </div>

        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#161A1D] text-balance">
            Spin the Blinded Ballot Wheel
          </h1>
          <p className="mt-2.5 text-sm text-[#5C646B] leading-relaxed">
            Every wedge represents an unpicked colleague in sealed form. Your own name is excluded.
            Wherever the brass pointer stops will unseal your match—and remove them from future
            spins.
          </p>
        </div>

        <div className="border-t border-b border-[#E5E3DC] py-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-[#5C646B]">Eligible Colleagues</p>
            <p className="mt-1 text-xl font-semibold text-[#161A1D] tabular-nums">
              {spinOptions.eligibleCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5C646B]">Wheel Mode</p>
            <p className="mt-1 text-sm font-medium text-[#161A1D] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#0F4C3A] shrink-0" />
              <span>Blinded Until Stop</span>
            </p>
          </div>
        </div>

        {spinError && (
          <div
            role="alert"
            className="border border-[#991B1B]/30 bg-[#991B1B]/[0.05] rounded-lg px-4 py-3 text-sm text-[#991B1B]"
          >
            {spinError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={!canSpin || spinning}
            onClick={handleSpin}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold bg-[#0F4C3A] text-white rounded-lg hover:bg-[#0B3A2C] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 ${spinning ? 'animate-spin' : ''}`} />
            <span>{spinning ? 'Spinning Sealed Ballots...' : 'Spin Ballot Wheel'}</span>
          </button>
        </div>
      </div>

      <div className="lg:col-span-7 flex flex-col items-center justify-center py-4">
        <BlindedWheel
          wedges={spinOptions.wedges}
          spinning={spinning}
          targetWedgeIndex={targetWedgeIndex}
          muted={muted}
          idleSpin={!spinning}
          onSpinComplete={handleWheelLanded}
          size={390}
          centerLabel={spinning ? 'BLIND' : 'SPIN'}
        />
        <p className="mt-4 text-xs text-[#5C646B] tabular-nums">
          {spinning
            ? 'Ballots sealed during rotation — wait for pointer to stop...'
            : `${spinOptions.eligibleCount} blinded ballot${spinOptions.eligibleCount === 1 ? '' : 's'} loaded for ${spinOptions.participant.firstName}`}
        </p>
      </div>
    </div>
  );
}
