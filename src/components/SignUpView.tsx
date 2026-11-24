import { useState, FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { PublicParticipant, PublicStateResponse } from '../types';
import { BlindedWheel } from './BlindedWheel';

interface SignUpViewProps {
  state: PublicStateResponse;
  lockedFirstName: string | null;
  onSignedUp: (participant: PublicParticipant, pin: string) => void;
  onNotify: (title: string, description?: string, variant?: 'success' | 'info') => void;
  onGoToSpin: () => void;
  onGoToMatch: () => void;
}

export function SignUpView({
  state,
  lockedFirstName,
  onSignedUp,
  onNotify,
  onGoToSpin,
  onGoToMatch,
}: SignUpViewProps) {
  const [firstName, setFirstName] = useState('');
  const [giftHint, setGiftHint] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredParticipant, setRegisteredParticipant] = useState<PublicParticipant | null>(null);

  const previewCount = state.stats.remainingOnWheel;
  const previewWedges =
    previewCount > 0
      ? Array.from({ length: previewCount }, (_, i) => {
          const num = String(i + 1).padStart(2, '0');
          return previewCount > 16 ? `#${num}` : `Seal ${num}`;
        })
      : [];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (lockedFirstName) {
      setError(`This browser is already signed in as ${lockedFirstName}.`);
      return;
    }

    const trimmedName = firstName.trim();
    const trimmedPin = pin.trim();
    if (trimmedName.length < 2) {
      setError('Please enter your first name.');
      return;
    }
    if (!/^\d{4}$/.test(trimmedPin)) {
      setError('Your secret PIN must be exactly 4 digits.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: trimmedName,
          giftHint: giftHint.trim(),
          pin: trimmedPin,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not complete sign-up.');
        return;
      }

      setRegisteredParticipant(data.participant);
      onNotify(
        `Signed up as ${data.participant.firstName}`,
        'Your 4-digit PIN is saved. Proceed to the Spin Wheel to draw your match.',
      );
      onSignedUp(data.participant, trimmedPin);
    } catch {
      setError('Network error while completing sign-up. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeName = registeredParticipant?.firstName || lockedFirstName;

  return (
    <div className="space-y-10">
      {/* 2-Column Hero Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Anonymous Digital Secret Santa Sign-Up Form */}
        <section className="lg:col-span-7 bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-[#5C646B] tracking-wide">
              {state.event.title} · Private Sign-Up
            </p>
            <h1 className="mt-2 text-4xl sm:text-5xl font-bold text-[#161A1D] tracking-tight text-balance">
              Enter Your First Name &amp; Spin Blindly
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#5C646B] max-w-2xl">
              Type your registered first name, add an optional gift hint, and create a private
              4-digit PIN. Once logged in, your session locks to your name so everything stays
              strictly anonymous.
            </p>

            {activeName ? (
              <div className="mt-8 border border-[#0F4C3A]/20 bg-[#0F4C3A]/[0.03] rounded-xl p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-[#0F4C3A] shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-[#161A1D]">
                      Signed in as {activeName}
                    </h2>
                    <p className="mt-1 text-sm text-[#5C646B]">
                      Your session is bound to {activeName}. You cannot switch to or register
                      another colleague&apos;s name on this browser.
                    </p>
                  </div>
                </div>

                <div className="border-t border-[#E5E3DC] pt-4 flex flex-wrap items-center justify-between gap-4 text-sm text-[#5C646B]">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#0F4C3A]" />
                    <span>Profile locked to {activeName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onGoToMatch}
                      className="px-4 py-2 text-sm font-medium border border-[#D6D3CB] rounded-lg text-[#161A1D] hover:bg-[#F8F7F4] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      View My Match
                    </button>
                    <button
                      type="button"
                      onClick={onGoToSpin}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-[#0F4C3A] text-white rounded-lg hover:bg-[#0B3A2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Proceed to Spin Wheel</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <div>
                  <label
                    htmlFor="signup-firstname"
                    className="block text-sm font-medium text-[#161A1D]"
                  >
                    First Name <span className="text-[#991B1B]">*</span>
                  </label>
                  <input
                    id="signup-firstname"
                    type="text"
                    required
                    autoComplete="off"
                    maxLength={40}
                    disabled={submitting}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Type your registered first name"
                    className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-white border border-[#D6D3CB] rounded-lg text-[#161A1D] placeholder:text-[#8A9199] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/20 focus:border-[#0F4C3A] disabled:bg-[#F3F2EE]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="signup-gifthint"
                    className="block text-sm font-medium text-[#161A1D]"
                  >
                    Gift Hint{' '}
                    <span className="text-[#5C646B] font-normal">
                      (optional — only seen by whoever matches with you)
                    </span>
                  </label>
                  <textarea
                    id="signup-gifthint"
                    rows={2}
                    maxLength={200}
                    disabled={submitting}
                    value={giftHint}
                    onChange={(e) => setGiftHint(e.target.value)}
                    placeholder="Optional: e.g. Coffee mug, desk notebook, or surprise me"
                    className="mt-1.5 w-full px-3.5 py-2.5 text-sm bg-white border border-[#D6D3CB] rounded-lg text-[#161A1D] placeholder:text-[#8A9199] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/20 focus:border-[#0F4C3A] disabled:bg-[#F3F2EE] resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-end">
                  <div>
                    <label htmlFor="signup-pin" className="block text-sm font-medium text-[#161A1D]">
                      4-Digit Secret PIN <span className="text-[#991B1B]">*</span>
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="signup-pin"
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        pattern="\d{4}"
                        maxLength={4}
                        required
                        disabled={submitting}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="4 digits"
                        className="w-full px-3.5 py-2.5 pr-10 font-mono text-sm tracking-widest bg-white border border-[#D6D3CB] rounded-lg text-[#161A1D] placeholder:text-[#8A9199] placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]/20 focus:border-[#0F4C3A] disabled:bg-[#F3F2EE]"
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

                  <p className="text-xs leading-relaxed text-[#5C646B]">
                    Your PIN locks your spin booth and lets you privately re-check your match
                    anytime. Nobody else can see your pairing.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="border border-[#991B1B]/30 bg-[#991B1B]/[0.05] rounded-lg px-4 py-3 text-sm text-[#991B1B]"
                  >
                    {error}
                  </div>
                )}

                <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-xs text-[#5C646B]">
                    <ShieldCheck className="w-4 h-4 text-[#0F4C3A] shrink-0" />
                    <span>Strictly anonymous · Registered staff only</span>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2.5 text-sm font-medium bg-[#0F4C3A] text-white rounded-lg hover:bg-[#0B3A2C] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {submitting ? 'Saving...' : 'Complete Sign-Up'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        {/* Right: Animated Blinded Wheel & How It Works */}
        <aside className="lg:col-span-5 bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-8 flex flex-col items-center justify-between gap-6">
          <div className="w-full text-left">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold text-[#161A1D]">Blinded Ballot Wheel</h2>
              <span className="text-xs font-mono tabular-nums text-[#5C646B]">
                {state.stats.remainingOnWheel} sealed slots
              </span>
            </div>
            <p className="mt-1 text-xs text-[#5C646B]">
              All colleague names remain completely hidden while the wheel spins.
            </p>
          </div>

          <div className="py-2 flex items-center justify-center">
            <BlindedWheel
              wedges={previewWedges}
              spinning={false}
              targetWedgeIndex={null}
              muted={true}
              idleSpin={true}
              size={280}
              centerLabel={previewCount > 0 ? `${previewCount} LEFT` : 'DONE'}
            />
          </div>

          <div className="w-full border-t border-[#E5E3DC] pt-5 space-y-3 text-sm">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-[#B45309] font-semibold">01</span>
              <p className="text-[#161A1D]">
                <span className="font-medium">Type your first name</span>, add an optional gift
                hint, and set a 4-digit PIN.
              </p>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-[#B45309] font-semibold">02</span>
              <p className="text-[#161A1D]">
                <span className="font-medium">Spin blindly</span>—your own name is excluded from
                your draw.
              </p>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-[#B45309] font-semibold">03</span>
              <p className="text-[#161A1D]">
                <span className="font-medium">Private unseal</span>—your match is removed from
                future spins while you stay on the wheel until drawn.
              </p>
            </div>
          </div>
        </aside>
      </div>

      {/* Full-Width 4-Column Anonymous Event Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#E5E3DC] border border-[#E5E3DC] rounded-xl overflow-hidden">
        <div className="bg-white p-5">
          <p className="text-xs text-[#5C646B]">Exchange Date</p>
          <p className="mt-1.5 text-lg font-semibold text-[#161A1D] tabular-nums">
            {state.event.exchangeDate}
          </p>
        </div>
        <div className="bg-white p-5">
          <p className="text-xs text-[#5C646B]">Total Participants</p>
          <p className="mt-1.5 text-lg font-semibold text-[#161A1D] tabular-nums">
            {state.stats.totalStaff}
          </p>
        </div>
        <div className="bg-white p-5">
          <p className="text-xs text-[#5C646B]">Privacy Mode</p>
          <p className="mt-1.5 text-lg font-semibold text-[#161A1D]">Anonymous</p>
        </div>
        <div className="bg-white p-5">
          <p className="text-xs text-[#5C646B]">Ballots Remaining on Wheel</p>
          <p className="mt-1.5 text-lg font-semibold text-[#0F4C3A] tabular-nums flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>{state.stats.remainingOnWheel}</span>
          </p>
        </div>
      </section>
    </div>
  );
}
