import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Vehicle } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  vehicles: Vehicle[];
  activeVehicle: Vehicle | null;
  isDemoMode: boolean;
  isLoading: boolean;
  demoNotification: string | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string, phone?: string) => Promise<void>;
  demoAccess: (name: string, email: string) => Promise<void>;
  logout: () => void;
  setActiveVehicle: (v: Vehicle) => void;
  toggleDemoMode: () => void;
  refreshVehicles: () => Promise<void>;
  resetDemoData: () => Promise<void>;
  dismissDemoNotification: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('ev_token'));
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeVehicle, setActiveVehicle] = useState<Vehicle | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [demoNotification, setDemoNotification] = useState<string | null>(null);

  const initAuth = async () => {
    setIsLoading(true);
    try {
      let storedToken = localStorage.getItem('ev_token');
      if (!storedToken) {
        try {
          const data = await api.login('demo@evsmarttrace.com', 'DemoPassword123!');
          if (data && data.access_token) {
            localStorage.setItem('ev_token', data.access_token);
            storedToken = data.access_token;
            setToken(data.access_token);
            setUser({ id: data.user_id, name: data.name, email: data.email, account_type: 'Demo' });
          }
        } catch {
          setUser({
            id: 1,
            name: 'Alex Rivers',
            email: 'demo@evsmarttrace.com',
            phone_number: '+1 (555) 234-5678',
            account_type: 'Demo',
            created_at: new Date().toISOString()
          });
        }
      } else {
        setToken(storedToken);
        try {
          const profile = await api.getProfile();
          setUser(profile);
        } catch {
          // Keep existing state
        }
      }

      const vList = await api.getVehicles();
      setVehicles(vList);
      if (vList.length > 0) {
        setActiveVehicle(vList[0]);
      }
    } catch (e) {
      console.error('Auth initialization error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  const login = async (email: string, pass: string) => {
    const data = await api.login(email, pass);
    localStorage.setItem('ev_token', data.access_token);
    setToken(data.access_token);
    setUser({ id: data.user_id, name: data.name, email: data.email, account_type: 'Registered' });
    setIsDemoMode(false);
    await refreshVehicles();
  };

  const register = async (name: string, email: string, pass: string, phone?: string) => {
    const data = await api.register(name, email, pass, phone);
    localStorage.setItem('ev_token', data.access_token);
    setToken(data.access_token);
    setUser({ id: data.user_id, name: data.name, email: data.email, phone_number: phone, account_type: 'Registered' });
    setIsDemoMode(false);
    await refreshVehicles();
  };

  const demoAccess = async (name: string, email: string) => {
    const data = await api.demoAccess(name, email);
    localStorage.setItem('ev_token', data.access_token);
    setToken(data.access_token);
    setUser({ id: data.user_id, name: data.name, email: data.email, account_type: 'Demo' });
    setIsDemoMode(true);
    await refreshVehicles();

    // Announce Demo Mode ON exactly once
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("Demo mode on and enjoy the ride.");
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
    }
    setDemoNotification("Demo mode on and enjoy the ride.");
  };

  const logout = () => {
    localStorage.removeItem('ev_token');
    setToken(null);
    setUser(null);
    setVehicles([]);
    setActiveVehicle(null);
  };

  const refreshVehicles = async () => {
    try {
      const vList = await api.getVehicles();
      setVehicles(vList);
      if (vList.length > 0) {
        setActiveVehicle(vList[0]);
      }
    } catch (e) {
      console.error('Failed to load vehicles:', e);
    }
  };

  const resetDemoData = async () => {
    try {
      const vList = await api.resetDemoData();
      setVehicles(vList);
      if (vList.length > 0) {
        setActiveVehicle(vList[0]);
      }
    } catch (e) {
      console.error('Reset demo data error:', e);
      await refreshVehicles();
    }
  };

  const toggleDemoMode = () => {
    setIsDemoMode((prev) => {
      const next = !prev;
      if (next) {
        // Speak exactly once when switching OFF -> ON
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance("Demo mode on and enjoy the ride.");
          u.rate = 1.0;
          window.speechSynthesis.speak(u);
        }
        setDemoNotification("Demo mode on and enjoy the ride.");
      } else {
        setDemoNotification(null);
      }
      return next;
    });
  };

  const dismissDemoNotification = () => {
    setDemoNotification(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        vehicles,
        activeVehicle,
        isDemoMode,
        isLoading,
        demoNotification,
        login,
        register,
        demoAccess,
        logout,
        setActiveVehicle,
        toggleDemoMode,
        refreshVehicles,
        resetDemoData,
        dismissDemoNotification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
