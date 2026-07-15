import { useCallback, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubscriptionsResponse, ApiError } from './types';
import { fetchSubscriptions, SubscriptionsError } from './lib/api';
import { SAMPLE_DATA } from './lib/sampleData';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { LandingView } from './components/LandingView';
import { FetchingView } from './components/FetchingView';
import { ResultView } from './components/ResultView';
import { YOUTUBE_PRIVACY_URL } from './constants';

// 状態機械: idle → fetching → done / error(ApiError)
type State =
  | { status: 'idle' }
  | { status: 'fetching' }
  | { status: 'done'; data: SubscriptionsResponse; sample: boolean }
  | { status: 'error'; error: ApiError };

type Action =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; data: SubscriptionsResponse }
  | { type: 'FETCH_ERROR'; error: ApiError }
  | { type: 'SHOW_SAMPLE' }
  | { type: 'RESET' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_START':
      return { status: 'fetching' };
    case 'FETCH_SUCCESS':
      return { status: 'done', data: action.data, sample: false };
    case 'FETCH_ERROR':
      return { status: 'error', error: action.error };
    case 'SHOW_SAMPLE':
      return { status: 'done', data: SAMPLE_DATA, sample: true };
    case 'RESET':
      return { status: 'idle' };
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });
  const lastHandle = useRef<string>('');

  const runFetch = useCallback(async (handle: string) => {
    lastHandle.current = handle;
    dispatch({ type: 'FETCH_START' });
    try {
      const data = await fetchSubscriptions(handle);
      dispatch({ type: 'FETCH_SUCCESS', data });
    } catch (err) {
      const code: ApiError =
        err instanceof SubscriptionsError ? err.code : 'UNKNOWN';
      dispatch({ type: 'FETCH_ERROR', error: code });
    }
  }, []);

  return (
    <div className="app">
      <Header />
      <main className="app__main">
        {state.status === 'idle' && (
          <LandingView
            onFetch={runFetch}
            onShowSample={() => dispatch({ type: 'SHOW_SAMPLE' })}
          />
        )}
        {state.status === 'fetching' && <FetchingView />}
        {state.status === 'done' && (
          <ResultView
            data={state.data}
            sample={state.sample}
            onRestart={() => dispatch({ type: 'RESET' })}
          />
        )}
        {state.status === 'error' && (
          <ErrorView
            error={state.error}
            onRetry={() => runFetch(lastHandle.current)}
            onRestart={() => dispatch({ type: 'RESET' })}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

interface ErrorViewProps {
  error: ApiError;
  onRetry: () => void;
  onRestart: () => void;
}

function ErrorView({ error, onRetry, onRestart }: ErrorViewProps) {
  const { t } = useTranslation();
  const showSettingsLink = error === 'SUBSCRIPTIONS_PRIVATE';

  return (
    <section className="errorview" role="alert">
      <p className="errorview__message">{t(`error.${error}`)}</p>
      {showSettingsLink && (
        <a
          className="errorview__link"
          href={YOUTUBE_PRIVACY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('error.settingsLink')} ↗
        </a>
      )}
      <div className="errorview__actions">
        <button type="button" className="btn btn--primary" onClick={onRetry}>
          {t('error.retry')}
        </button>
        <button type="button" className="link-btn" onClick={onRestart}>
          ← {t('result.restart')}
        </button>
      </div>
    </section>
  );
}
