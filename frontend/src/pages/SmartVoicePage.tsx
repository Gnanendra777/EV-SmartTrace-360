import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Globe, 
  Send, 
  AlertTriangle, 
  CheckCircle2, 
  Car, 
  Zap, 
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Info
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

type SupportedLanguage = 'en' | 'te' | 'hi';

interface CockpitQueryItem {
  id: number;
  en: string;
  te: string;
  hi: string;
}

const COCKPIT_QUERIES: CockpitQueryItem[] = [
  {
    id: 1,
    en: "Hello",
    te: "హలో",
    hi: "नमस्ते"
  },
  {
    id: 2,
    en: "What is my battery percentage?",
    te: "నా బ్యాటరీ శాతం ఎంత?",
    hi: "मेरी बैटरी का प्रतिशत कितना है?"
  },
  {
    id: 3,
    en: "What is my battery health?",
    te: "నా బ్యాటరీ ఆరోగ్యం ఎంత?",
    hi: "मेरी बैटरी का स्वास्थ्य कैसा है?"
  },
  {
    id: 4,
    en: "What is the battery temperature?",
    te: "బ్యాటరీ ఉష్ణోగ్రత ఎంత?",
    hi: "बैटरी का तापमान क्या है?"
  },
  {
    id: 5,
    en: "How much range is remaining?",
    te: "మిగిలిన రేంజ్ ఎంత?",
    hi: "कितनी रेंज बची है?"
  },
  {
    id: 6,
    en: "Explain my battery degradation trend.",
    te: "నా బ్యాటరీ క్షీణత ధోరణిని వివరించండి.",
    hi: "मेरी बैटरी ह्रास रुझान बताएं।"
  },
  {
    id: 7,
    en: "What is my average energy consumption?",
    te: "నా సగటు విద్యుత్ వినియోగం ఎంత?",
    hi: "मेरी औसत ऊर्जा खपत क्या है?"
  },
  {
    id: 8,
    en: "How long will charging take?",
    te: "ఛార్జింగ్ చేయడానికి ఎంత సమయం పడుతుంది?",
    hi: "चार्जिंग में कितना समय लगेगा?"
  },
  {
    id: 9,
    en: "What is my estimated charging cost?",
    te: "అంచనా వేసిన ఛార్జింగ్ ఖర్చు ఎంత?",
    hi: "मेरी अनुमानित चार्जिंग लागत क्या है?"
  },
  {
    id: 10,
    en: "Which connector does my vehicle support?",
    te: "నా వాహనం ఏ కనెక్టర్‌కు మద్దతు ఇస్తుంది?",
    hi: "मेरा वाहन किस कनेक्टर का समर्थन करता है?"
  },
  {
    id: 11,
    en: "Find nearby charging stations.",
    te: "సమీప ఛార్జింగ్ స్టేషన్‌లను కనుగొనండి.",
    hi: "आस-पास के चार्जिंग स्टेशन खोजें।"
  },
  {
    id: 12,
    en: "Is my vehicle healthy?",
    te: "నా వాహనం ఆరోగ్యంగా ఉందా?",
    hi: "क्या मेरा वाहन स्वस्थ है?"
  },
  {
    id: 13,
    en: "Calculate a route to my destination.",
    te: "నా గమ్యస్థానానికి మార్గాన్ని లెక్కించండి.",
    hi: "मेरे गंतव्य के लिए मार्ग की गणना करें।"
  },
  {
    id: 14,
    en: "Which route consumes less energy?",
    te: "ఏ మార్గం తక్కువ శక్తిని వినియోగిస్తుంది?",
    hi: "कौन सा मार्ग कम ऊर्जा की खपत करता है?"
  },
  {
    id: 15,
    en: "Enable Demo Mode.",
    te: "డెమో మోడ్‌ను ప్రారంభించండి.",
    hi: "डेमो मोड सक्षम करें।"
  }
];

export const SmartVoicePage: React.FC = () => {
  const { activeVehicle } = useAuth();
  
  // Persist language selection
  const [language, setLanguage] = useState<SupportedLanguage>(() => {
    const saved = localStorage.getItem('smartvoice_lang');
    return (saved === 'te' || saved === 'hi' || saved === 'en') ? saved : 'en';
  });

  const getInitialGreeting = (lang: SupportedLanguage) => {
    switch (lang) {
      case 'te':
        return "హలో! మీకు మంచి రోజు కలగాలి. EV SmartTrace 360 కి స్వాగతం. ఈరోజు మీ కారుకు సంబంధించి ఏదైనా సహాయం కావాలా?";
      case 'hi':
        return "नमस्ते! आपका दिन शुभ हो। EV SmartTrace 360 में आपका स्वागत है। क्या आज आपको अपनी कार के लिए कोई सहायता चाहिए?";
      case 'en':
      default:
        return "Hello! Have a nice day. Welcome to EV SmartTrace 360. Do you need any help with your car today?";
    }
  };

  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'assistant'; text: string; time: string }>>([
    {
      sender: 'assistant',
      text: getInitialGreeting(language),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [alertNotice, setAlertNotice] = useState<any>(null);

  const recognitionRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Sync language selection to localStorage
  const handleLanguageChange = (newLang: SupportedLanguage) => {
    setLanguage(newLang);
    localStorage.setItem('smartvoice_lang', newLang);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    setVoiceNotice(null);
  };

  // Web Speech API Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      const langCodes: Record<SupportedLanguage, string> = { en: 'en-US', te: 'te-IN', hi: 'hi-IN' };
      recognition.lang = langCodes[language];

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceNotice(null);
      };

      recognition.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        if (text) {
          handleSend(text);
        }
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error:', e.error);
        setIsListening(false);
        if (e.error === 'not-allowed') {
          setVoiceNotice('Microphone access was denied. Please allow microphone permissions or type your question below.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [language]);

  // Auto-scroll chat log
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSpeaking, isListening, isLoading]);

  // Strict Text-To-Speech handler
  const speak = (text: string) => {
    if (muted || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    const langCodes: Record<SupportedLanguage, string> = { en: 'en-US', te: 'te-IN', hi: 'hi-IN' };
    const targetCode = langCodes[language];
    u.lang = targetCode;
    u.rate = 1.0;

    // Check available browser voices
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find(v => 
      v.lang.toLowerCase() === targetCode.toLowerCase() || 
      v.lang.toLowerCase().startsWith(language)
    );

    if (matchedVoice) {
      u.voice = matchedVoice;
    } else if (language !== 'en') {
      // Per instructions: "If a required browser speech voice is unavailable, display the translated text and explain that spoken output is unavailable. Do not silently speak in another language."
      setVoiceNotice(`Spoken audio output for ${language === 'te' ? 'Telugu (తెలుగు)' : 'Hindi (हिन्दी)'} is not supported by your browser voice pack. The translated text is displayed in the chat log above.`);
      return;
    }

    u.onstart = () => setIsSpeaking(true);
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(u);
  };

  const handleSend = async (msg: string) => {
    const cleanMsg = msg.trim();
    if (!cleanMsg || !activeVehicle || isLoading) return;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [...prev, { sender: 'user', text: cleanMsg, time }]);
    setInput('');
    setIsLoading(true);
    setVoiceNotice(null);

    try {
      const res = await api.sendAssistantChat(activeVehicle.id, cleanMsg, language);
      setMessages((prev) => [...prev, { sender: 'assistant', text: res.response_text, time }]);
      if (res.proactive_alert) {
        setAlertNotice(res.proactive_alert);
      }
      speak(res.audio_text || res.response_text);
    } catch (e) {
      console.error('SmartVoice error:', e);
      const fallbackText = language === 'te'
        ? "క్షమించండి, నేను ప్రస్తుతం EV SmartTrace 360 కాక్‌పిట్ ప్రశ్నలకు మాత్రమే సహాయం చేయగలను. దయచేసి కొనసాగించడానికి నమూనా కాక్‌పిట్ ప్రశ్నలలో ఒకదాన్ని ఎంచుకోండి."
        : language === 'hi'
        ? "क्षमा करें, मैं वर्तमान में केवल EV SmartTrace 360 कॉकपिट प्रश्नों में ही सहायता कर सकता हूँ। कृपया जारी रखने के लिए नमूना कॉकपिट प्रश्नों में से एक का चयन करें।"
        : "Sorry, I can currently assist with the EV SmartTrace 360 cockpit queries only. Please select one of the Sample Cockpit Queries to continue.";
      setMessages((prev) => [...prev, { sender: 'assistant', text: fallbackText, time }]);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (err) {
          console.warn('Recognition start exception:', err);
        }
      } else {
        setVoiceNotice("Speech Recognition is not supported on this browser. You can type commands into the chat bar below.");
      }
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  return (
    <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              MODULE SIX: EV SMARTVOICE INTELLIGENCE
            </span>
            <span className="text-xs text-slate-400">Automotive Natural Language Interface</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            Cockpit Voice Assistant & Conversational Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl">
            Real-time CAN-bus voice assistant. Ask questions about battery charge, estimated range, health degradation, diagnostics, and charging stops.
          </p>
        </div>

        {/* Language & Voice Controls */}
        <div className="flex items-center space-x-2">
          {/* Strict 3-Language Selector */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs shadow-lg">
            <Globe className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-1" />
            <button
              onClick={() => handleLanguageChange('en')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                language === 'en'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              English
            </button>
            <button
              onClick={() => handleLanguageChange('te')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                language === 'te'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              తెలుగు
            </button>
            <button
              onClick={() => handleLanguageChange('hi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                language === 'hi'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              हिन्दी
            </button>
          </div>

          {/* Mute / Unmute Button */}
          <button
            onClick={() => {
              setMuted(!muted);
              stopSpeaking();
            }}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all shadow-lg"
            title={muted ? 'Unmute Audio Speech' : 'Mute Audio Speech'}
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Voice Warning Notice if browser voice unavailable or mic error */}
      {voiceNotice && (
        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-amber-500/40 flex items-center justify-between text-xs text-amber-300 font-mono animate-fadeIn">
          <div className="flex items-center space-x-2.5">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{voiceNotice}</span>
          </div>
          <button onClick={() => setVoiceNotice(null)} className="text-slate-400 hover:text-white text-xs ml-3">✕</button>
        </div>
      )}

      {/* Proactive Voice Alert Banner */}
      {alertNotice && (
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between animate-pulse">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-300 uppercase tracking-wide">{alertNotice.title}</p>
              <p className="text-xs text-slate-300 mt-0.5">{alertNotice.message}</p>
            </div>
          </div>
          <button
            onClick={() => setAlertNotice(null)}
            className="text-xs text-slate-400 hover:text-slate-200 ml-4 font-mono"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* =========================================================================
          SECTION 1: SMARTVOICE MICROPHONE / LISTENING AREA
         ========================================================================= */}
      <div className="glass-panel-glow rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden space-y-6">
        
        {/* Animated Radial Waves */}
        <div className="relative flex items-center justify-center">
          <div className={`w-32 h-32 rounded-full bg-gradient-to-tr from-cyan-500/20 via-emerald-500/20 to-blue-500/20 flex items-center justify-center transition-all duration-500 ${
            isListening ? 'scale-125 shadow-[0_0_50px_rgba(244,63,94,0.4)]' : isSpeaking ? 'scale-110 shadow-[0_0_50px_rgba(32,214,194,0.4)]' : ''
          }`}>
            <button
              onClick={triggerListening}
              className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition transform active:scale-95 ${
                isListening
                  ? 'bg-rose-500 text-white shadow-rose-500/50 animate-pulse'
                  : isSpeaking
                  ? 'bg-cyan-500 text-slate-950 shadow-cyan-500/40 animate-pulse'
                  : 'bg-gradient-to-r from-cyan-500 to-emerald-400 text-slate-950 shadow-cyan-500/30 hover:scale-105'
              }`}
              title="Click to speak your command"
            >
              {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
            </button>
          </div>
        </div>

        {/* Waveform Bars */}
        <div className="flex items-center space-x-1.5 h-10">
          {[6, 12, 18, 28, 36, 22, 30, 16, 8, 24, 32, 14, 8].map((h, idx) => (
            <span
              key={idx}
              style={{
                height: isListening || isSpeaking ? `${Math.max(8, h * 1.2)}px` : '4px',
                transition: 'height 0.15s ease'
              }}
              className={`w-1.5 rounded-full ${
                isListening
                  ? 'bg-rose-400 animate-pulse'
                  : isSpeaking
                  ? 'bg-cyan-400 animate-pulse'
                  : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Audio State Label */}
        <div>
          <span className={`text-xs font-mono font-bold tracking-wider uppercase ${
            isListening ? 'text-rose-400' : isSpeaking ? 'text-cyan-400' : 'text-slate-400'
          }`}>
            {isListening
              ? (language === 'te' ? 'వినబడుతోంది... మీ ప్రశ్న మాట్లాడండి' : language === 'hi' ? 'सुन रहा हूँ... अपना प्रश्न बोलें' : 'LISTENING... SPEAK YOUR COMMAND')
              : isSpeaking
              ? (language === 'te' ? 'స్మార్ట్‌వాయిస్ మాట్లాడుతోంది...' : language === 'hi' ? 'स्मार्टवॉइस बोल रहा है...' : 'SMARTVOICE IS SPEAKING...')
              : (language === 'te' ? 'మాట్లాడటానికి మైక్రోఫోన్ నొక్కండి' : language === 'hi' ? 'बोलने के लिए माइक्रोफ़ोन दबाएं' : 'TAP MICROPHONE TO SPEAK')}
          </span>
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="block mx-auto mt-2 text-[11px] font-mono text-slate-400 hover:text-rose-400 transition-colors"
            >
              [Stop Speaking]
            </button>
          )}
          <p className="text-xs text-slate-500 mt-1">
            {language === 'te'
              ? '"నా బ్యాటరీ శాతం ఎంత?" లేదా "నా వాహనం ఏ కనెక్టర్‌కు మద్దతు ఇస్తుంది?"'
              : language === 'hi'
              ? '"मेरी बैटरी का प्रतिशत कितना है?" या "मेरा वाहन किस कनेक्टर का समर्थन करता है?"'
              : '"What is my battery percentage?" or "Which connector does my vehicle support?"'}
          </p>
        </div>

      </div>

      {/* =========================================================================
          SECTION 2: CHAT INPUT BAR WITH MICROPHONE & SEND BUTTON (IMMEDIATELY ABOVE SAMPLE QUERIES)
         ========================================================================= */}
      <div className="glass-panel p-2.5 sm:p-3 rounded-2xl border border-cyan-500/30 shadow-xl bg-slate-900/80">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="flex items-center gap-2"
        >
          {/* Quick Mic Action in Input Bar */}
          <button
            type="button"
            onClick={triggerListening}
            className={`p-2.5 rounded-xl transition-all flex items-center justify-center flex-shrink-0 ${
              isListening
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700'
            }`}
            title="Speak Question"
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder={
              language === 'te'
                ? "EV ప్రశ్నను టైప్ చేయండి (ఉదా: 'నా బ్యాటరీ శాతం ఎంత?', 'ఛార్జింగ్ సమయం ఎంత?')..."
                : language === 'hi'
                ? "EV प्रश्न टाइप करें (उदा: 'मेरी बैटरी का प्रतिशत कितना है?', 'कितनी रेंज बची है?')..."
                : "Type an EV question (e.g. 'What is my battery percentage?', 'How long will charging take?')..."
            }
            className="flex-1 bg-transparent px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 disabled:opacity-40 transition-all flex items-center space-x-1.5 flex-shrink-0 shadow-md shadow-cyan-500/20"
          >
            <span>{isLoading ? 'Processing...' : 'Send'}</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* =========================================================================
          SECTION 3: SAMPLE COCKPIT QUERIES (15 WORKING QUERIES)
         ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block font-mono flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sample Cockpit Queries (Click to Ask)</span>
          </span>
          <span className="text-[11px] font-mono text-cyan-400/80">
            {COCKPIT_QUERIES.length} Verified Subsystem Queries
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
          {COCKPIT_QUERIES.map((q) => {
            const queryText = q[language] || q.en;
            return (
              <button
                key={q.id}
                onClick={() => handleSend(queryText)}
                disabled={isLoading}
                className="p-3 rounded-xl glass-panel text-left text-xs text-slate-300 hover:border-cyan-500/60 hover:text-cyan-300 transition-all border border-slate-800/80 bg-slate-900/60 flex flex-col justify-between group active:scale-[0.98] disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-medium text-slate-200 group-hover:text-cyan-200 leading-snug">
                    "{queryText}"
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 flex-shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono mt-2 block">
                  #{q.id} • {q.id <= 5 ? 'Telemetry' : q.id <= 10 ? 'Power & Cost' : 'Diagnostics & Nav'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          SECTION 4: ACTIVE SESSION LOG & CONVERSATION RESPONSES
         ========================================================================= */}
      <div className="glass-panel rounded-2xl p-5 sm:p-6 space-y-4 max-h-[500px] overflow-y-auto border border-cyan-500/20 shadow-xl">
        <div className="border-b border-slate-800 pb-2.5 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-slate-300 uppercase tracking-wider">Active Session Log</span>
          </div>
          <span>Connected: {activeVehicle?.vehicle_name || 'My EV'}</span>
        </div>

        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-lg ${
                m.sender === 'user'
                  ? 'bg-cyan-600 text-white rounded-tr-none'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>
              <span className="block text-[9px] text-slate-400/80 mt-1.5 text-right font-mono">
                {m.time}
              </span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 text-xs text-cyan-400 italic font-mono animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Analyzing powertrain telemetry & generating response...</span>
          </div>
        )}

        <div ref={endRef} />
      </div>

    </div>
  );
};
export default SmartVoicePage;
