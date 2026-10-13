import React, { useState } from 'react';
import { authService } from '../../services/authService.ts';
import {
  Lock,
  Mail,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { AppLogo } from '../common/AppLogo.tsx';

export interface AuthViewProps {
  onSuccess: (user: any, org: any) => void;
  onNavigate?: (path: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onSuccess, onNavigate }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const result = isSignUp
        ? await authService.signUpWithEmail(
            email.trim(),
            password,
            orgName.trim() || undefined
          )
        : await authService.signInWithEmail(email.trim(), password);

      onSuccess(result.user, result.organization);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.message ||
          'Authentication failed. You can also explore directly using Demo Mode.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    try {
      setIsLoading(true);
      setError('');
      const result = await authService.loginAsDemo();
      onSuccess(result.user, result.organization);
    } catch (err: any) {
      console.error(err);
      setError('Failed to initialize demo mode');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      setError('');
      const result = await authService.signInWithGoogle();
      onSuccess(result.user, result.organization);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.message || 'Google sign-in was cancelled or encountered an error.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 antialiased">
      {/* Brand */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="flex items-center justify-center">
          <AppLogo size="xl" className="justify-center" />
        </div>
      </div>

      {/* Sign-in / sign-up card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200 sm:px-10">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">
              {isSignUp ? 'Create your organization' : 'Sign in to your account'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isSignUp
                ? 'Get started with compliant WhatsApp business broadcasts.'
                : 'Access your broadcasts, inbox conversations, and automations.'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Instant Demo Access */}
          <div className="mb-5">
            <button
              id="demo-login-btn"
              type="button"
              disabled={isLoading}
              onClick={handleDemoLogin}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-emerald-950 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 text-emerald-700" />
              <span>Explore Instant Demo (No Password Required)</span>
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase font-semibold">
                <span className="bg-white px-2 text-slate-400 text-[10px]">
                  Or continue with email
                </span>
              </div>
            </div>
          </div>

          {/* Email/password form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business / Organization Name
                </label>
                <input
                  id="signup-org-name"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Apex Global Solutions"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  id="auth-password-input"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <button
              id="auth-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <span>
                {isLoading
                  ? 'Please wait...'
                  : isSignUp
                    ? 'Create Account'
                    : 'Sign In'}
              </span>
              {!isLoading && <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </form>

          {/* Google SSO */}
          <div className="mt-4">
            <button
              id="google-signin-btn"
              type="button"
              disabled={isLoading}
              onClick={handleGoogleLogin}
              className="w-full py-2 px-4 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              Sign in with Google
            </button>
          </div>

          <div className="mt-6 text-center text-xs">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-emerald-700 hover:text-emerald-800 font-semibold"
            >
              {isSignUp
                ? 'Already have an account? Sign In'
                : "Don't have an account? Sign Up"}
            </button>
          </div>
        </div>

        {/* Security/compliance and legal links */}
        <div className="mt-6 flex flex-col items-center gap-2 text-slate-400 text-xs text-center">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Meta WhatsApp Cloud API & GDPR Consent Compliant</span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
            <a
              href="/privacy"
              onClick={(e) => {
                if (onNavigate) {
                  e.preventDefault();
                  onNavigate('/privacy');
                }
              }}
              className="text-slate-500 hover:text-emerald-700 underline transition-colors"
            >
              Privacy Policy
            </a>
            <span>•</span>
            <a
              href="/data-deletion"
              onClick={(e) => {
                if (onNavigate) {
                  e.preventDefault();
                  onNavigate('/data-deletion');
                }
              }}
              className="text-slate-500 hover:text-emerald-700 underline transition-colors"
            >
              Data Deletion Instructions
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
