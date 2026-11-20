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

  // Hardcoded demo fallback data when backend is unreachable
  const DEMO_USER: User = {
    id: 1,
    name: 'Alex Rivers',
    email: 'demo@evsmarttrace.com',
    phone_number: '+1 (555) 234-5678',
    account_type: 'Demo',
    created_at: new Date().toISOString()
  };

  const DEMO_VEHICLES: Vehicle[] = [
    {
      id: 1,
      user_id: 1,
      vehicle_name: 'CyberPulse GT (Demo)',
      manufacturer: 'Tesla',
      model: 'Model 3 Dual Motor',
      vehicle_type: 'Sedan',
      battery_capacity: 60.0,
      battery_chemistry: 'Lithium Nickel Manganese Cobalt (NMC)',
      max_charging_power: 170.0,
      connector_types: 'CCS2, Tesla Supercharger, Type 2',
      vehicle_identifier: 'EV-ST360-9842-DEMO',
      current_battery_pct: 70.0,
      efficiency_kwh_km: 0.150,
      is_demo: true,
      created_at: new Date().toISOString()
    }
  ];

  const initAuth = async () => {
    setIsLoading(true);
    let userResolved = false;
    let vehiclesResolved = false;

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
            userResolved = true;
          }
        } catch {
          // Backend unreachable – use demo user
        }
      } else {
        setToken(storedToken);
        try {
          const profile = await api.getProfile();
          setUser(profile);
          userResolved = true;
        } catch {
          // Token invalid or backend down
        }
      }

      // Always fall back to demo user if nothing resolved
      if (!userResolved) {
        setUser(DEMO_USER);
        setIsDemoMode(true);
      }

      try {
        const vList = await api.getVehicles();
        if (Array.isArray(vList) && vList.length > 0) {
          setVehicles(vList);
          setActiveVehicle(vList[0]);
          vehiclesResolved = true;
        }
      } catch {
        // Backend unreachable for vehicles
      }

      // Always fall back to demo vehicles if nothing resolved
      if (!vehiclesResolved) {
        setVehicles(DEMO_VEHICLES);
        setActiveVehicle(DEMO_VEHICLES[0]);
      }
    } catch (e) {
      console.error('Auth initialization error:', e);
      // Ultimate fallback
      setUser(DEMO_USER);
      setVehicles(DEMO_VEHICLES);
      setActiveVehicle(DEMO_VEHICLES[0]);
      setIsDemoMode(true);
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
      if (Array.isArray(vList) && vList.length > 0) {
        setVehicles(vList);
        setActiveVehicle(vList[0]);
      } else {
        setVehicles(DEMO_VEHICLES);
        setActiveVehicle(DEMO_VEHICLES[0]);
      }
    } catch (e) {
      console.error('Failed to load vehicles:', e);
      setVehicles(DEMO_VEHICLES);
      setActiveVehicle(DEMO_VEHICLES[0]);
    }
  };

  const resetDemoData = async () => {
    try {
      const vList = await api.resetDemoData();
      if (Array.isArray(vList) && vList.length > 0) {
        setVehicles(vList);
        setActiveVehicle(vList[0]);
      } else {
        setVehicles(DEMO_VEHICLES);
        setActiveVehicle(DEMO_VEHICLES[0]);
      }
    } catch (e) {
      console.error('Reset demo data error:', e);
      setVehicles(DEMO_VEHICLES);
      setActiveVehicle(DEMO_VEHICLES[0]);
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
