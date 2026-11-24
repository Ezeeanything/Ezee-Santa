import { useState, useEffect, FormEvent } from 'react';
import { Eye, EyeOff, Gift, Lock } from 'lucide-react';
import { MatchDetails, PublicParticipant, PublicStateResponse } from '../types';

interface MyMatchViewProps {
  state: PublicStateResponse;
  lockedFirstName: string | null;
  onVerifiedProfile: (firstName: string, pin?: string) => void;
  onGoToSpin: (participant: PublicParticipant, pin: string) => void;
}

export function MyMatchView({
  state,
  lockedFirstName,
  onVerifiedProfile,
  onGoToSpin,
}: MyMatchViewProps) {
  const [firstName, setFirstName] = useState(lockedFirstName || '');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lookupResult, setLookupResult] = useState<{
    hasSpun: boolean;
    participant: PublicParticipant;
    match: MatchDetails | null;
  } | null>(null);
  const [privacyHidden, setPrivacyHidden] = useState(false);

  useEffect(() => {
    if (lockedFirstName) {
      setFirstName(lockedFirstName);
    }
  }, [lockedFirstName]);

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const effectiveName = (lockedFirstName || firstName).trim();
    const trimmedPin = pin.trim();
    if (effectiveName.length < 2) {
      setError('Enter your first name.');
      return;
    }
    if (!/^\d{4}$/.test(trimmedPin)) {
      setError('Enter your 4-digit secret PIN.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/my-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: effectiveName, pin: trimmedPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not retrieve match.');
        return;
      }

      onVerifiedProfile(data.participant.firstName, trimmedPin);
      setLookupResult(data);
      setPrivacyHidden(false);
    } catch {
      setError('Network error while checking your match.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white border border-[#E5E3DC] rounded-xl p-6 sm:p-8 space-y-6">
      <div>
        <p className="text-xs font-medium text-[#5C646B]">Private Match Retrieval</p>
        <h1 className="mt-1 text-3xl sm:text-4xl font-bold text-[#161A1D]">
          View Your Secret Recipient
        </h1>
        <p className="mt-2 text-sm text-[#5C646B]">
          {lockedFirstName
            ? `Enter your 4-digit PIN to view ${lockedFirstName}'s secret match and optional gift hint.`
            : 'Type your registered first name and 4-digit PIN to check who you matched with.'}
        </p>
      </div>

      {!lookupResult ? (
        <form onSubmit={handleLookup} className="space-y-5">
          <div>
            <label htmlFor="lookup-name" className="block text-sm font-medium text-[#161A1D]">
              First Name
            </label>
            <div className="relative mt-1.5">
              <input
                id="lookup-name"
                type="text"
                required
                readOnly={Boolean(lockedFirstName)}
                autoComplete="off"
                maxLength={40}
                value={lockedFirstName || firstName}
                onChange={(e) => {
                  if (lockedFirstName) return;
                  setFirstName(e.target.value);
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
            <label htmlFor="lookup-pin" className="block text-sm font-medium text-[#161A1D]">
              4-Digit Secret PIN
            </label>
            <div className="relative mt-1.5">
              <input
                id="lookup-pin"
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={4}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
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

          {error && (
            <div
              role="alert"
              className="border border-[#991B1B]/30 bg-[#991B1B]/[0.05] rounded-lg px-4 py-3 text-sm text-[#991B1B]"
            >
              {error}
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 text-sm font-medium bg-[#0F4C3A] text-white rounded-lg hover:bg-[#0B3A2C] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {loading ? 'Checking...' : 'Check My Match'}
            </button>
          </div>
        </form>
      ) : !lookupResult.hasSpun ? (
        <div className="border border-[#E5E3DC] rounded-xl p-6 bg-[#F8F7F4] space-y-4">
          <p className="text-base font-medium text-[#161A1D]">
            {lookupResult.participant.firstName}, you have not spun the wheel yet.
          </p>
          <p className="text-sm text-[#5C646B]">
            Head to the Spin Wheel booth now to draw your blinded Secret Santa match.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onGoToSpin(lookupResult.participant, pin.trim())}
              className="px-5 py-2.5 text-sm font-medium bg-[#0F4C3A] text-white rounded-lg hover:bg-[#0B3A2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open My Spin Booth
            </button>
            <button
              type="button"
              onClick={() => setLookupResult(null)}
              className="px-4 py-2.5 text-sm font-medium text-[#5C646B] hover:text-[#161A1D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[#5C646B]">
              Signed in as{' '}
              <span className="font-medium text-[#161A1D]">{lookupResult.participant.firstName}</span>
            </p>
            <button
              type="button"
              onClick={() => setPrivacyHidden((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium border border-[#D6D3CB] rounded-lg text-[#161A1D] hover:bg-[#F8F7F4] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {privacyHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span>{privacyHidden ? 'Show Match' : 'Hide Match'}</span>
            </button>
          </div>

          {privacyHidden ? (
            <div className="py-10 text-center border border-[#E5E3DC] rounded-xl bg-[#F8F7F4] space-y-2">
              <Lock className="w-6 h-6 text-[#5C646B] mx-auto" />
              <p className="text-sm font-medium text-[#161A1D]">Match Hidden</p>
            </div>
          ) : (
            <div className="border border-[#0F4C3A]/20 bg-[#0F4C3A]/[0.03] rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-[#5C646B]">Your Secret Recipient</p>
                  <p className="mt-1 text-4xl font-bold text-[#0F4C3A] font-display">
                    {lookupResult.match?.firstName}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#0F4C3A] text-white flex items-center justify-center shrink-0">
                  <Gift className="w-5 h-5" />
                </div>
              </div>

              <div className="border-t border-[#E5E3DC] pt-4">
                <p className="text-xs font-medium text-[#5C646B]">Gift Hint (Optional)</p>
                <p className="mt-1 text-sm text-[#161A1D]">
                  {lookupResult.match?.giftHint
                    ? lookupResult.match.giftHint
                    : 'No gift hint provided—feel free to surprise them!'}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#E5E3DC]">
            <span className="text-xs text-[#5C646B]">
              Exchange Date: {state.event.exchangeDate}
            </span>
            <button
              type="button"
              onClick={() => {
                setLookupResult(null);
                setPin('');
              }}
              className="px-4 py-2 text-sm font-medium text-[#5C646B] hover:text-[#161A1D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Lock Screen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
