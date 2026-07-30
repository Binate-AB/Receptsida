// ============================================
// ErrorBoundary — reusable client boundary
// Wraps an API-dependent subtree (e.g. the recipe
// search results area) so a render throw shows a
// friendly, retryable message instead of a white
// screen. Route-level app/error.js is the backstop;
// this keeps the rest of the page usable.
// ============================================

'use client';

import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback(this.reset);
      return (
        <div className="max-w-sm mx-auto text-center py-12 px-6">
          <div
            className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: 'rgba(255,107,53,0.12)' }}
          >
            <AlertTriangle size={22} style={{ color: '#FF6B35' }} />
          </div>
          <p className="text-warm-700 text-sm mb-4">
            Kunde inte visa det här just nu. Försök igen om en stund.
          </p>
          <button onClick={this.reset} className="btn-secondary inline-flex items-center gap-2 text-sm">
            <RotateCcw size={14} /> Försök igen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
