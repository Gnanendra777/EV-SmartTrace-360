import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Zap, 
  ArrowRight, 
  Sparkles,
  Gauge
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-[#080c14] text-slate-100 overflow-x-hidden">
      
      {/* Top Navigation */}
      <header className="w-full glass-panel border-b border-slate-800/80 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-400 p-[1.5px] shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-[#080c14] rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-emerald-400" />
              </div>
            </div>
            <div>
              <span className="text-base font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                EV SmartTrace 360
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              to="/login"
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition"
            >
              Sign In
            </Link>
            <Link
              to="/dashboard"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 hover:brightness-110 transition flex items-center space-x-1.5"
            >
              <span>Explore Demo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-12 sm:pt-16 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex-1 flex flex-col justify-center items-center text-center">
        
        {/* Glow ambient background effects */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-gradient-to-tr from-emerald-500/15 via-cyan-500/10 to-transparent blur-[120px] pointer-events-none rounded-full" />

        {/* Badge */}
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-mono mb-6 shadow-sm">
          <Sparkles className="w-3.5 h-3.5" />
          <span>NEXT-GENERATION ELECTRIC VEHICLE INTELLIGENCE PLATFORM</span>
        </div>

        {/* Main Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-4xl leading-tight">
          Drive Smart. Charge Smart.{' '}
          <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Travel Safe.
          </span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl leading-relaxed">
          The centralized AI co-pilot that monitors battery degradation, predicts accurate driving range with Random Forest ML, pinpoints nearby chargers, detects vehicle faults with Isolation Forest, and speaks via an intelligent voice assistant.
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4">
          <Link
            to="/dashboard"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 font-bold text-sm shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:brightness-110 transition flex items-center justify-center space-x-2"
          >
            <Gauge className="w-4 h-4" />
            <span>Launch Live Dashboard</span>
          </Link>
          <Link
            to="/register"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl glass-panel text-slate-200 font-semibold text-sm hover:border-slate-600 transition"
          >
            Create Driver Account
          </Link>
        </div>

        {/* Cockpit Preview Stats Bar */}
        <div className="mt-16 w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-4 p-4 glass-panel-glow rounded-2xl">
          <div className="p-3">
            <span className="text-[11px] font-mono text-slate-500 uppercase block">Predictive Accuracy</span>
            <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1 block">97.2%</span>
            <span className="text-[10px] text-slate-400">Random Forest Ensemble</span>
          </div>
          <div className="p-3">
            <span className="text-[11px] font-mono text-slate-500 uppercase block">Monitored Sensors</span>
            <span className="text-xl sm:text-2xl font-bold font-mono text-cyan-400 mt-1 block">42+</span>
            <span className="text-[10px] text-slate-400">Live Telemetry Channels</span>
          </div>
          <div className="p-3">
            <span className="text-[11px] font-mono text-slate-500 uppercase block">Charging Network</span>
            <span className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1 block">500+ kW</span>
            <span className="text-[10px] text-slate-400">CCS2 & Supercharger</span>
          </div>
          <div className="p-3">
            <span className="text-[11px] font-mono text-slate-500 uppercase block">Voice Assistant</span>
            <span className="text-xl sm:text-2xl font-bold font-mono text-cyan-400 mt-1 block">3 Languages</span>
            <span className="text-[10px] text-slate-400">English, Telugu, Hindi</span>
          </div>
        </div>

      </section>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 py-8 px-4 text-center text-xs text-slate-500">
        <p>© 2026 EV SmartTrace 360 Inc. All rights reserved. Drive Smart. Charge Smart. Travel Safe.</p>
        <p className="mt-1 font-mono text-[10px]">Built with React, TypeScript, FastAPI, Scikit-learn, and MySQL</p>
      </footer>

    </div>
  );
};
