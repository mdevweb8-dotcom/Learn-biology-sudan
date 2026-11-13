import React, { useState } from 'react';
import { LessonDiagram } from '../types/biology';
import { ZoomIn, ZoomOut, RotateCcw, Info, CheckCircle2 } from 'lucide-react';

interface DiagramViewerProps {
  diagram: LessonDiagram;
  interactive?: boolean;
  highlightPartId?: string;
  onSelectPart?: (partId: string) => void;
  selectedPartId?: string;
  showAllLabels?: boolean;
}

export const DiagramViewer: React.FC<DiagramViewerProps> = ({
  diagram,
  interactive = true,
  highlightPartId,
  onSelectPart,
  selectedPartId,
  showAllLabels = true,
}) => {
  const [zoom, setZoom] = useState(1);
  const [activeLabelId, setActiveLabelId] = useState<string | null>(highlightPartId || null);

  const activeLabel = diagram.labels.find((l) => l.id === (selectedPartId || activeLabelId || highlightPartId));

  const handlePinClick = (labelId: string) => {
    setActiveLabelId(labelId);
    if (onSelectPart) {
      onSelectPart(labelId);
    }
  };

  const renderSvgIllustration = () => {
    switch (diagram.type) {
      case 'cell_structure':
        return (
          <svg viewBox="0 0 500 350" className="w-full h-full drop-shadow-md">
            <defs>
              <radialGradient id="cytoplasmGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#064e3b" stopOpacity="0.4" />
                <stop offset="85%" stopColor="#042f2e" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#0f766e" stopOpacity="0.9" />
              </radialGradient>
              <radialGradient id="nucleusGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#831843" stopOpacity="0.9" />
                <stop offset="60%" stopColor="#500724" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#9d174d" stopOpacity="0.8" />
              </radialGradient>
              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Plasma Membrane & Cell Outline */}
            <path
              d="M 70,170 C 60,80 180,40 300,50 C 420,60 460,140 440,240 C 420,310 320,330 200,320 C 90,310 80,240 70,170 Z"
              fill="url(#cytoplasmGrad)"
              stroke="#10b981"
              strokeWidth="5"
              strokeDasharray="none"
              className="transition-all duration-300"
            />
            {/* Plasma membrane lipid bilayer indication */}
            <path
              d="M 76,170 C 66,86 182,46 298,56 C 414,66 452,142 434,236 C 414,304 318,324 202,314 C 96,304 86,236 76,170 Z"
              fill="none"
              stroke="#059669"
              strokeWidth="2"
              strokeDasharray="3 3"
            />

            {/* Nucleus */}
            <g
              className="cursor-pointer transition-transform hover:scale-105"
              onClick={() => handlePinClick('nucleus')}
            >
              <ellipse
                cx="240"
                cy="140"
                rx="65"
                ry="55"
                fill="url(#nucleusGrad)"
                stroke="#f43f5e"
                strokeWidth="3"
                className={activeLabel?.id === 'nucleus' ? 'filter drop-shadow-[0_0_12px_#f43f5e]' : ''}
              />
              {/* Nucleolus */}
              <circle cx="235" cy="135" r="18" fill="#fda4af" opacity="0.8" />
              {/* Chromatin threads */}
              <path d="M 200,120 Q 215,145 230,125 T 260,150" stroke="#fb7185" strokeWidth="2" fill="none" opacity="0.6" />
              <path d="M 210,155 Q 235,160 255,130" stroke="#fb7185" strokeWidth="2" fill="none" opacity="0.6" />
            </g>

            {/* Endoplasmic Reticulum folds */}
            <g
              className="cursor-pointer"
              onClick={() => handlePinClick('er')}
            >
              <path
                d="M 175,140 C 150,140 140,165 155,190 C 170,210 195,200 210,215"
                stroke="#38bdf8"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                className={activeLabel?.id === 'er' ? 'filter drop-shadow-[0_0_10px_#38bdf8]' : ''}
              />
              <path
                d="M 185,120 C 145,120 130,150 145,180"
                stroke="#38bdf8"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                opacity="0.8"
              />
            </g>

            {/* Mitochondria 1 */}
            <g
              className="cursor-pointer group"
              onClick={() => handlePinClick('mitochondria')}
            >
              <ellipse
                cx="120"
                cy="230"
                rx="35"
                ry="20"
                transform="rotate(-25 120 230)"
                fill="#d97706"
                stroke="#f59e0b"
                strokeWidth="2.5"
                className={activeLabel?.id === 'mitochondria' ? 'filter drop-shadow-[0_0_12px_#f59e0b]' : ''}
              />
              {/* Cristae folds */}
              <path
                d="M 98,235 Q 110,225 106,238 T 125,225 T 136,232"
                stroke="#fef3c7"
                strokeWidth="2"
                fill="none"
              />
            </g>

            {/* Golgi Apparatus */}
            <g
              className="cursor-pointer"
              onClick={() => handlePinClick('golgi')}
            >
              <path
                d="M 340,180 C 370,175 385,195 380,210"
                stroke="#a855f7"
                strokeWidth="6"
                strokeLinecap="round"
                fill="none"
                className={activeLabel?.id === 'golgi' ? 'filter drop-shadow-[0_0_12px_#a855f7]' : ''}
              />
              <path
                d="M 345,195 C 375,190 390,210 385,225"
                stroke="#a855f7"
                strokeWidth="5"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 350,210 C 375,205 385,220 382,235"
                stroke="#c084fc"
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
              />
              {/* Secretory vesicles */}
              <circle cx="395" cy="185" r="4" fill="#d8b4fe" />
              <circle cx="390" cy="235" r="5" fill="#d8b4fe" />
              <circle cx="340" cy="225" r="4" fill="#d8b4fe" />
            </g>

            {/* Ribosomes dots */}
            <circle cx="160" cy="155" r="2" fill="#e0e7ff" />
            <circle cx="170" cy="165" r="2" fill="#e0e7ff" />
            <circle cx="150" cy="175" r="2" fill="#e0e7ff" />
            <circle cx="280" cy="260" r="2.5" fill="#e0e7ff" />
            <circle cx="295" cy="245" r="2.5" fill="#e0e7ff" />
            <circle cx="190" cy="95" r="2" fill="#e0e7ff" />
          </svg>
        );

      case 'mitochondria':
        return (
          <svg viewBox="0 0 500 300" className="w-full h-full drop-shadow-md">
            <defs>
              <linearGradient id="mitoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#b45309" />
                <stop offset="100%" stopColor="#78350f" />
              </linearGradient>
            </defs>
            {/* Outer Membrane */}
            <ellipse cx="250" cy="150" rx="200" ry="100" fill="url(#mitoGrad)" stroke="#f59e0b" strokeWidth="4" />
            {/* Inner Membrane & Cristae folds */}
            <path
              d="M 90,150 C 90,90 410,90 410,150 
                 C 410,165 370,160 370,130 
                 C 370,175 330,170 330,120 
                 C 330,180 290,185 290,115 
                 C 290,185 250,180 250,110 
                 C 250,185 210,180 210,115 
                 C 210,180 170,175 170,120 
                 C 170,170 130,165 130,135 
                 C 130,165 90,165 90,150 Z"
              fill="#92400e"
              stroke="#fbbf24"
              strokeWidth="3.5"
            />
            {/* Matrix label target */}
            <circle cx="160" cy="140" r="4" fill="#fef3c7" />
            <circle cx="240" cy="150" r="3" fill="#fef3c7" />
            <circle cx="320" cy="145" r="4" fill="#fef3c7" />
          </svg>
        );

      case 'chloroplast':
        return (
          <svg viewBox="0 0 500 300" className="w-full h-full drop-shadow-md">
            <defs>
              <linearGradient id="chloroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#065f46" />
                <stop offset="100%" stopColor="#022c22" />
              </linearGradient>
            </defs>
            <ellipse cx="250" cy="150" rx="210" ry="110" fill="url(#chloroGrad)" stroke="#10b981" strokeWidth="4" />
            <ellipse cx="250" cy="150" rx="195" ry="98" fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="4 2" />

            {/* Grana Stacks (Thylakoids) */}
            {[140, 220, 300, 370].map((cx, idx) => (
              <g key={idx}>
                <ellipse cx={cx} cy={120} rx="26" ry="8" fill="#15803d" stroke="#86efac" strokeWidth="1.5" />
                <ellipse cx={cx} cy={135} rx="26" ry="8" fill="#15803d" stroke="#86efac" strokeWidth="1.5" />
                <ellipse cx={cx} cy={150} rx="26" ry="8" fill="#15803d" stroke="#86efac" strokeWidth="1.5" />
                <ellipse cx={cx} cy={165} rx="26" ry="8" fill="#15803d" stroke="#86efac" strokeWidth="1.5" />
              </g>
            ))}
            {/* Lamellae connecting thylakoids */}
            <path d="M 166,135 L 194,135 M 246,150 L 274,150 M 326,135 L 344,135" stroke="#4ade80" strokeWidth="2" />
          </svg>
        );

      case 'dna_structure':
      default:
        return (
          <svg viewBox="0 0 500 300" className="w-full h-full drop-shadow-md">
            {/* DNA double helix ribbons */}
            <path
              d="M 70,60 Q 150,150 250,60 T 430,60"
              stroke="#06b6d4"
              strokeWidth="7"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M 70,240 Q 150,150 250,240 T 430,240"
              stroke="#3b82f6"
              strokeWidth="7"
              fill="none"
              strokeLinecap="round"
            />
            {/* Base pairs rungs */}
            {[100, 140, 180, 220, 260, 300, 340, 380, 410].map((x, i) => {
              const yTop = 60 + Math.sin((x / 50) * Math.PI) * 50;
              const yBottom = 240 - Math.sin((x / 50) * Math.PI) * 50;
              const color = i % 2 === 0 ? '#10b981' : '#f59e0b';
              return (
                <line
                  key={i}
                  x1={x}
                  y1={yTop}
                  x2={x}
                  y2={yBottom}
                  stroke={color}
                  strokeWidth="3.5"
                  strokeDasharray="5 3"
                />
              );
            })}
          </svg>
        );
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Header bar with controls */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <h4 className="text-sm font-bold text-slate-200">{diagram.title}</h4>
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.2, 1.8))}
            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition"
            title="تكبير"
            aria-label="تكبير الرسم"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.8))}
            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition"
            title="تصغير"
            aria-label="تصغير الرسم"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom(1)}
            className="p-1.5 rounded-lg hover:bg-slate-800 hover:text-white transition"
            title="إعادة ضبط"
            aria-label="إعادة ضبط الحجم"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <span className="text-xs bg-slate-800/80 text-emerald-400 font-mono px-2 py-0.5 rounded mr-1">
            ص {diagram.pageRef}
          </span>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full h-72 sm:h-80 bg-radial from-slate-900 via-slate-950 to-black overflow-hidden flex items-center justify-center p-2">
        <div
          className="w-full h-full relative transition-transform duration-200"
          style={{ transform: `scale(${zoom})` }}
        >
          {renderSvgIllustration()}

          {/* Interactive Pins over diagram */}
          {showAllLabels &&
            diagram.labels.map((lbl) => {
              const isSelected = activeLabel?.id === lbl.id;
              return (
                <button
                  key={lbl.id}
                  onClick={() => handlePinClick(lbl.id)}
                  style={{ left: `${lbl.x}%`, top: `${lbl.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center transition-all ${
                    isSelected
                      ? 'scale-125 z-20 ring-4 ring-emerald-500/50'
                      : 'hover:scale-110 z-10'
                  }`}
                  aria-label={`تحديد ${lbl.name}`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg transition-colors ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-900/90 text-emerald-400 border border-emerald-500/60'
                    }`}
                  >
                    ●
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      {/* Active Part Description Banner */}
      {activeLabel && (
        <div className="p-3.5 bg-slate-950 border-t border-slate-800/80 flex items-start gap-3 transition-all">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0 mt-0.5">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-emerald-300">{activeLabel.name}</p>
              <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full">
                مرجع الكتاب ص {diagram.pageRef}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">{activeLabel.description}</p>
          </div>
        </div>
      )}

      {/* Caption footer */}
      <div className="px-4 py-2 bg-slate-950/50 text-[11px] text-slate-400 flex items-center gap-2 border-t border-slate-800/40">
        <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span className="truncate">{diagram.caption}</span>
      </div>
    </div>
  );
};
