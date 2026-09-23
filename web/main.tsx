import React from 'react';
import { createRoot } from 'react-dom/client';
import WorkspaceApp from './components/cube/WorkspaceApp';
import './app/globals.css';
import './app/puzzles.css';
import { t } from './lib/i18n';
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error">
        <h1>{t('app.error')}</h1>
        <p>{t('app.errorHelp')}</p>
        <button onClick={() => location.reload()}>{t('app.reload')}</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <WorkspaceApp />
  </ErrorBoundary>,
);
