import React, { useState, useEffect } from 'react';
import { AuditProvider } from './services/auditStore';
import { RoleSwitcherBar } from './components/layout/RoleSwitcherBar';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import type { NavTab } from './components/layout/Sidebar';
import { DashboardView } from './components/views/DashboardView';
import { AuditQueueView } from './components/views/AuditQueueView';
import { SaleActionDetailView } from './components/views/SaleActionDetailView';
import { RecheckTodayView } from './components/views/RecheckTodayView';
import { AuditorPortfolioView } from './components/views/AuditorPortfolioView';
import { AuditorPerformanceView } from './components/views/AuditorPerformanceView';
import { ReportsView } from './components/views/ReportsView';
import { SettingsView } from './components/views/SettingsView';

const MainApp: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [targetQueueItemId, setTargetQueueItemId] = useState<string | null>(null);
  const [targetActionId, setTargetActionId] = useState<string | null>(null);

  // Sync dark mode class on HTML document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Deep navigation helpers
  const handleSelectQueueItem = (id: string) => {
    setTargetQueueItemId(id);
    setActiveTab('queue');
  };

  const handleSelectAction = (id: string) => {
    setTargetActionId(id);
    setActiveTab('action-detail');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* 1. Global Role Switcher Demo Bar */}
      <RoleSwitcherBar />

      {/* 2. Top Header / Brand Navbar */}
      <Navbar darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* 3. Main Workspace with Sidebar & Dynamic View */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Dynamic Content View */}
        <main className="flex-1 p-4 sm:p-5 lg:p-6 min-w-0 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              onNavigate={setActiveTab}
              onSelectQueueItem={handleSelectQueueItem}
              onSelectAction={handleSelectAction}
            />
          )}

          {activeTab === 'queue' && (
            <AuditQueueView
              onNavigateToAction={handleSelectAction}
              initialSelectedId={targetQueueItemId}
            />
          )}

          {activeTab === 'action-detail' && (
            <SaleActionDetailView initialActionId={targetActionId} />
          )}

          {activeTab === 'recheck-today' && (
            <RecheckTodayView
              onSelectAction={handleSelectAction}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'portfolio' && <AuditorPortfolioView />}

          {activeTab === 'performance' && <AuditorPerformanceView />}

          {activeTab === 'reports' && <ReportsView />}

          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuditProvider>
      <MainApp />
    </AuditProvider>
  );
};

export default App;
