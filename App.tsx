
import React from 'react';
import { CookingPot } from './components/CookingPot';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-4 overflow-hidden relative">
      <div 
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundColor: '#0a0a0a',
          backgroundImage: `
            radial-gradient(#ffffff08 1.5px, transparent 0),
            radial-gradient(#ffffff08 1.5px, #0a0a0a 0)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 10px 10px',
          opacity: 0.8
        }}
      />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/10 blur-[140px] rounded-full pointer-events-none" />
      
      <main className="z-10 text-center flex flex-col items-center">
        <div className="mb-10">
          <CookingPot />
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-4 animate-pulse uppercase">
          Work In Progress
        </h1>
        
        <p className="text-xl md:text-2xl text-zinc-400 font-serif italic mb-12">
          Something special is being cooked...
        </p>

        <div className="h-[1px] w-32 bg-gradient-to-r from-transparent via-orange-500/50 to-transparent mb-10" />

        <div className="space-y-4 mb-12">
          <p className="text-sm tracking-[0.3em] text-zinc-500 uppercase">Created by</p>
          <p className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            El Houssain Souhail
          </p>
        </div>

        <div className="flex gap-8 items-center justify-center">
          <a 
            href="https://github.com/Ductive99" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-orange-500 transition-colors duration-300 text-xs uppercase tracking-[0.2em] font-medium"
          >
            GitHub
          </a>
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
          <a 
            href="https://linkedin.com/in/elhoussain" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-orange-500 transition-colors duration-300 text-xs uppercase tracking-[0.2em] font-medium"
          >
            LinkedIn
          </a>
        </div>
      </main>

      <footer className="absolute bottom-8 text-zinc-600 text-[10px] uppercase tracking-[0.4em] font-medium">
        Cooking for the Future
      </footer>
    </div>
  );
};

export default App;
