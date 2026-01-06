
import React from 'react';

export const CookingPot: React.FC = () => {
  return (
    <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center">
      <style>{`
        @keyframes stir {
          0% { transform: rotate(0deg) translateX(22px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(22px) rotate(-360deg); }
        }
        @keyframes steam {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          50% { opacity: 0.4; }
          100% { transform: translateY(-50px) scale(1.6); opacity: 0; }
        }
        .animate-stir {
          animation: stir 3s linear infinite;
          transform-origin: center;
        }
        .animate-steam {
          animation: steam 4s ease-out infinite;
        }
      `}</style>

      <svg
        viewBox="0 -20 200 220"
        className="w-full h-full drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="pot-front-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2a2a2a" />
            <stop offset="100%" stopColor="#121212" />
          </linearGradient>

          <linearGradient id="pot-back-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#121212" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </linearGradient>

          <clipPath id="pot-clip">
            <path d="M40 80 H160 V140 Q160 160 140 160 H60 Q40 160 40 140 V80Z" />
          </clipPath>
        </defs>

        <ellipse cx="100" cy="80" rx="61" ry="12" fill="url(#pot-back-grad)" stroke="#333" strokeWidth="2" />
        
        <ellipse cx="100" cy="83" rx="58" ry="10" fill="#7c2d12" />
        
        <g className="animate-stir" style={{ transformOrigin: '100px 80px' }}>
            <rect x="97.5" y="10" width="5" height="82" rx="2.5" fill="#5d2a0b" />
            <rect x="98.5" y="10" width="1.5" height="82" fill="rgba(255,255,255,0.1)" />
            
            <ellipse cx="100" cy="92" rx="12" ry="16" fill="#5d2a0b" />
            <ellipse 
              cx="96" 
              cy="88" 
              rx="3" 
              ry="6" 
              fill="rgba(255,255,255,0.08)" 
              transform="rotate(-15, 96, 88)" 
            />
        </g>

        <path
          d="M40 80 H160 V140 Q160 160 140 160 H60 Q40 160 40 140 V80Z"
          fill="url(#pot-front-grad)"
        />

        <path 
          d="M38 75 Q100 90 162 75 L162 82 Q100 97 38 82 Z" 
          fill="#333" 
          stroke="#444" 
          strokeWidth="1" 
        />
        
        <path d="M40 105 H30 Q25 105 25 115 V125 Q25 135 30 135 H40" fill="none" stroke="#2a2a2a" strokeWidth="6" strokeLinecap="round" />
        <path d="M160 105 H170 Q175 105 175 115 V125 Q175 135 170 135 H160" fill="none" stroke="#2a2a2a" strokeWidth="6" strokeLinecap="round" />

        <g opacity="0.6">
          <path d="M75 55 Q80 45 75 35" stroke="white" strokeWidth="2" strokeLinecap="round" className="animate-steam" style={{ animationDelay: '0s' }} />
          <path d="M100 50 Q105 40 100 30" stroke="white" strokeWidth="2" strokeLinecap="round" className="animate-steam" style={{ animationDelay: '1.5s' }} />
          <path d="M125 55 Q130 45 125 35" stroke="white" strokeWidth="2" strokeLinecap="round" className="animate-steam" style={{ animationDelay: '0.7s' }} />
        </g>

        <path d="M55 95 V135" stroke="white" strokeWidth="12" strokeLinecap="round" opacity="0.02" />
      </svg>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-44 h-4 bg-orange-900/20 blur-xl rounded-[100%]"></div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-32 h-2 bg-black/60 blur-md rounded-[100%]"></div>
    </div>
  );
};
