import React from 'react';
import { CarModelId } from '../types/game';

interface CarIconProps {
  model: CarModelId;
  color: string;
  isMoving?: boolean;
  className?: string;
}

export const CarIcon: React.FC<CarIconProps> = ({
  model,
  color,
  isMoving = false,
  className = 'w-14 h-7',
}) => {
  return (
    <svg
      viewBox="0 0 84 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Speed lines when racing */}
      {isMoving && (
        <g opacity="0.75">
          <line x1="2" y1="16" x2="11" y2="16" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
          <line x1="0" y1="22" x2="8" y2="22" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      )}

      {/* Ground shadow */}
      <ellipse cx="45" cy="34.5" rx="28" ry="3.5" fill="rgba(0,0,0,0.42)" />

      {model === 'formula' && (
        <g>
          {/* Rear wing */}
          <path d="M13 13H21L19 23H14L13 13Z" fill="#1E293B" />
          <rect x="11" y="12" width="11" height="3.5" rx="1" fill={color} />
          {/* Body chassis */}
          <path
            d="M17 24L25 18H48L69 24.5C72 25.3 73 27 72 28.5H17V24Z"
            fill={color}
          />
          {/* Cockpit & halo */}
          <path d="M36 18C38 14 45 14 48 18H36Z" fill="#0F172A" />
          <circle cx="42" cy="16.5" r="2.6" fill="#F8FAFC" />
          {/* Front wing */}
          <path d="M67 26.5H77L75 29.5H65L67 26.5Z" fill="#1E293B" />
          {/* Racing stripe */}
          <rect x="26" y="21.5" width="32" height="2" rx="1" fill="rgba(255,255,255,0.45)" />
        </g>
      )}

      {model === 'gt' && (
        <g>
          {/* Spoiler */}
          <path d="M14 16L18 20H15L12 16H14Z" fill="#0F172A" />
          <rect x="11" y="14.5" width="8" height="2.2" rx="1" fill={color} />
          {/* Sleek Coupe Body */}
          <path
            d="M14 23C14 20.5 17 19 22 19L30 13.5C33 12 45 12 50 14L60 19.5L71 21.5C73.5 22 75 24 75 26.5V28.5H14V23Z"
            fill={color}
          />
          {/* Windows */}
          <path d="M31 15L47 15.5L56 19.5H27L31 15Z" fill="#0F172A" />
          {/* Headlight */}
          <rect x="69" y="22.5" width="4.5" height="2.2" rx="1" fill="#FEF08A" />
          <rect x="14" y="22.5" width="3" height="2.5" rx="0.8" fill="#EF4444" />
        </g>
      )}

      {model === 'rally' && (
        <g>
          {/* Roof scoop & big rally wing */}
          <path d="M13 13H21V18H16L13 13Z" fill="#0F172A" />
          <rect x="11" y="12" width="11" height="2.8" rx="1" fill={color} />
          {/* Hatchback Rally Body */}
          <path
            d="M16 19L22 12.5H45L54 19.5L70 21C73 21.5 74.5 24 74.5 26.5V28.5H16V19Z"
            fill={color}
          />
          {/* Windows */}
          <path d="M24 14.5H43.5L50.5 19.5H21.5L24 14.5Z" fill="#0F172A" />
          {/* Rally stripe */}
          <path d="M16 24.5H74.5" stroke="#FFFFFF" strokeWidth="2.2" strokeOpacity="0.55" />
          <rect x="70" y="22.5" width="4" height="2.5" rx="1" fill="#FEF08A" />
        </g>
      )}

      {model === 'muscle' && (
        <g>
          {/* Blower intake */}
          <rect x="52" y="16.5" width="7" height="3.5" rx="1" fill="#CBD5E1" />
          {/* Boxy Muscle Body */}
          <path
            d="M14 20.5H24L29 14H46L51 19.5H72C74 19.5 75 21 75 23.5V28.5H14V20.5Z"
            fill={color}
          />
          {/* Cabin */}
          <path d="M30 15.5H44.5L48.5 19.5H26.5L30 15.5Z" fill="#0F172A" />
          {/* Twin stripe */}
          <rect x="16" y="23.5" width="56" height="2" fill="rgba(255,255,255,0.6)" />
          <rect x="71.5" y="21.5" width="3.5" height="3" rx="0.8" fill="#FEF08A" />
        </g>
      )}

      {model === 'ev' && (
        <g>
          {/* Futuristic Aero Wedge */}
          <path
            d="M13 24C14 19.5 22 15.5 34 14.5C46 13.5 56 16.5 64 20L73 22.5C75 23 76 25 75 28.5H13V24Z"
            fill={color}
          />
          {/* Panoramic glass */}
          <path d="M27 17C35 14.5 47 15 56 19.5H24L27 17Z" fill="#0F172A" />
          {/* LED light bar */}
          <rect x="67" y="23" width="7" height="1.8" rx="0.9" fill="#E0F2FE" />
          <rect x="14" y="23" width="6" height="1.8" rx="0.9" fill="#FB7185" />
        </g>
      )}

      {model === 'classic' && (
        <g>
          {/* Classic Rounded Touring */}
          <path
            d="M14 23C14 20 18 19 24 19L30 13.5C35 12 46 12 50 14.5L56 19.5L70 20.5C73 21 75 23.5 75 26.5V28.5H14V23Z"
            fill={color}
          />
          <path d="M31 15H47L52.5 19.5H27L31 15Z" fill="#0F172A" />
          {/* Chrome bumpers & number circle */}
          <rect x="12" y="26" width="5" height="2.2" rx="1" fill="#E2E8F0" />
          <rect x="71" y="26" width="5" height="2.2" rx="1" fill="#E2E8F0" />
          <circle cx="42" cy="24" r="3.8" fill="#FFFFFF" fillOpacity="0.9" />
          <circle cx="71" cy="22" r="1.8" fill="#FEF08A" />
        </g>
      )}

      {/* Front & Rear Wheels */}
      <g>
        <circle cx="26" cy="29.5" r="6" fill="#0F172A" />
        <circle cx="26" cy="29.5" r="2.8" fill="#94A3B8" />
        <circle cx="62" cy="29.5" r="6" fill="#0F172A" />
        <circle cx="62" cy="29.5" r="2.8" fill="#94A3B8" />
      </g>
    </svg>
  );
};
