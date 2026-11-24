import { useCallback, useEffect, useState } from 'react';
import { MyMatchView } from './components/MyMatchView';
import { SignUpView } from './components/SignUpView';
import { SpinBoothView } from './components/SpinBoothView';
import { ToastContainer, ToastItem } from './components/ToastContainer';
import { PublicParticipant, PublicStateResponse } from './types';

type AppTab = 'signup' | 'spin' | 'match';

const LOCKED_NAME_KEY = 'ezee_santa_locked_name';
const LOCKED_EPOCH_KEY = 'ezee_santa_locked_epoch';
const SESSION_KEY = 'ezee_santa_session';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('signup');
  const [state, setState] = useState<PublicStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (title: string, description?: string, variant: 'success' | 'info' = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-2), { id, title, description, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    [],
  );

  const [lockedFirstName, setLockedFirstName] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCKED_NAME_KEY);
    } catch {
      return null;
    }
  });

  const [activeSession, setActiveSession] = useState<{
    firstName: string;
    pin: string;
  } | null>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { firstName?: string; pin?: string };
      if (parsed.firstName && parsed.pin) {
        return { firstName: parsed.firstName, pin: parsed.pin };
      }
      return null;
    } catch {
      return null;
    }
  });

  const bindProfile = useCallback(
    (firstName: string, pin?: string) => {
      setLockedFirstName(firstName);
      try {
        localStorage.setItem(LOCKED_NAME_KEY, firstName);
        if (state?.event.epoch) {
          localStorage.setItem(LOCKED_EPOCH_KEY, state.event.epoch);
        }
      } catch {
        // Ignore storage failures
      }
      if (pin) {
        const session = { firstName, pin };
        setActiveSession(session);
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        } catch {
          // Ignore storage failures
        }
      }
    },
    [state?.event.epoch],
  );

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) {
        throw new Error('Failed to load ballot state');
      }
      const data = (await res.json()) as PublicStateResponse;
      try {
        const savedEpoch = localStorage.getItem(LOCKED_EPOCH_KEY);
        if (savedEpoch !== data.event.epoch) {
          localStorage.removeItem(LOCKED_NAME_KEY);
          localStorage.setItem(LOCKED_EPOCH_KEY, data.event.epoch);
          sessionStorage.removeItem(SESSION_KEY);
          setLockedFirstName(null);
          setActiveSession(null);
        }
      } catch {
        // Ignore storage failures
      }
      setState(data);
      setLoadError(null);
    } catch {
      setLoadError('Unable to reach the ballot server. Please check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleSignedUp = async (participant: PublicParticipant, pin: string) => {
    bindProfile(participant.firstName, pin);
    await fetchState();
  };

  const handleUnlockSession = (participant: PublicParticipant, pin: string) => {
    bindProfile(participant.firstName, pin);
  };

  const navItems: Array<{ id: AppTab; label: string }> = [
    { id: 'signup', label: 'Sign Up' },
    { id: 'spin', label: 'Spin Wheel' },
    { id: 'match', label: 'My Match' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F4] text-[#161A1D]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-[#E5E3DC]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('signup')}
            className="font-display text-3xl font-bold tracking-tight text-[#0F4C3A] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Ezee Santa
          </button>

          <nav className="flex items-center gap-6 sm:gap-8 overflow-x-auto" aria-label="Primary">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'border-[#0F4C3A] text-[#0F4C3A]'
                      : 'border-transparent text-[#5C646B] hover:text-[#161A1D]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="hidden sm:flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab(activeTab === 'spin' ? 'match' : 'spin')}
              className="px-4 py-2 text-xs font-medium bg-[#0F4C3A] text-white rounded-lg hover:bg-[#0B3A2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeTab === 'spin' ? 'View My Match' : 'Spin Ballot'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {loading ? (
          <div className="space-y-6" aria-busy="true" aria-label="Loading ballot">
            <div className="h-96 bg-white border border-[#E5E3DC] rounded-xl animate-pulse" />
            <div className="h-24 bg-white border border-[#E5E3DC] rounded-xl animate-pulse" />
          </div>
        ) : loadError || !state ? (
          <div className="max-w-lg mx-auto bg-white border border-[#E5E3DC] rounded-xl p-8 text-center space-y-4">
            <p className="text-base font-semibold text-[#161A1D]">Connection Error</p>
            <p className="text-sm text-[#5C646B]">{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetchState();
              }}
              className="px-5 py-2.5 text-sm font-medium bg-[#0F4C3A] text-white rounded-lg hover:bg-[#0B3A2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'signup' && (
              <SignUpView
                state={state}
                lockedFirstName={lockedFirstName}
                onSignedUp={handleSignedUp}
                onNotify={showToast}
                onGoToSpin={() => setActiveTab('spin')}
                onGoToMatch={() => setActiveTab('match')}
              />
            )}

            {activeTab === 'spin' && (
              <SpinBoothView
                state={state}
                lockedFirstName={lockedFirstName}
                activeSession={activeSession}
                onUnlockSession={handleUnlockSession}
                onNotify={showToast}
                onStateRefresh={fetchState}
                onGoToSignUp={() => setActiveTab('signup')}
                onGoToMatch={() => setActiveTab('match')}
              />
            )}

            {activeTab === 'match' && (
              <MyMatchView
                state={state}
                lockedFirstName={lockedFirstName}
                onVerifiedProfile={bindProfile}
                onGoToSpin={(participant, pin) => {
                  handleUnlockSession(participant, pin);
                  setActiveTab('spin');
                }}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-[#E5E3DC] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-[#5C646B]">
          <span>
            {state ? `${state.event.title} · ${state.event.venue}` : 'Ezee Santa Office Exchange'}
          </span>
          <span>Blinded wheel balloting · Pairings remain private</span>
        </div>
      </footer>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
