import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode, Suspense } from 'react';
import { recordRuntimeDiagnostic } from '../lib/runtimeDiagnostics';

interface RecoveryBoundaryProps {
  children: ReactNode;
  scope: 'app' | 'feature';
}

interface RecoveryBoundaryState {
  error: Error | null;
}

class RecoveryBoundary extends Component<RecoveryBoundaryProps, RecoveryBoundaryState> {
  state: RecoveryBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RecoveryBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordRuntimeDiagnostic('error', `react.${this.props.scope}`, error, info.componentStack);
    console.error('Unhandled application error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isAppFailure = this.props.scope === 'app';
    const content = (
      <>
        <span className="recovery-boundary-icon" aria-hidden="true">
          <AlertTriangle size={24} strokeWidth={1.8} />
        </span>
        <div className="recovery-boundary-copy">
          {isAppFailure ? <h1>应用遇到问题</h1> : <h2>此功能暂时无法显示</h2>}
          <p>
            {isAppFailure
              ? '当前界面未能正常启动。可以重试加载界面，不会强制刷新应用窗口。'
              : '当前模块加载或渲染失败，其他功能仍可继续使用。重试不会刷新整个应用。'}
          </p>
        </div>
        <button
          className="recovery-boundary-action"
          onClick={() => this.setState({ error: null })}
          type="button"
        >
          <RefreshCw size={16} aria-hidden="true" />
          重试
        </button>
        <details className="recovery-boundary-details">
          <summary>技术信息</summary>
          <code>{this.state.error.message || this.state.error.name}</code>
        </details>
      </>
    );

    return isAppFailure ? (
      <main className="recovery-boundary recovery-boundary--app" role="alert">
        {content}
      </main>
    ) : (
      <section className="recovery-boundary recovery-boundary--feature" role="alert">
        {content}
      </section>
    );
  }
}

interface FeatureBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  resetKey: string;
}

export function FeatureBoundary({ children, fallback, resetKey }: FeatureBoundaryProps) {
  return (
    <RecoveryBoundary key={resetKey} scope="feature">
      <Suspense fallback={fallback}>{children}</Suspense>
    </RecoveryBoundary>
  );
}

export function AppBoundary({ children }: { children: ReactNode }) {
  return <RecoveryBoundary scope="app">{children}</RecoveryBoundary>;
}
