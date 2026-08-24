import React, { useState } from "react";
import { Sidebar } from "@/shared/components/Sidebar";
import { useTheme } from "@/shared/hooks/useTheme";
import { 
  FiSun, FiMoon, FiMonitor, FiCheck, FiLayout
} from "react-icons/fi";
import { Button } from "@/shared/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/shared/components/ui/card";

const Settings: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("appearance");

  return (
    <div className="flex h-screen bg-background text-foreground transition-all duration-300 overflow-hidden">
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto p-4 lg:p-8">
          
          <header className="mb-10 px-8 py-10 rounded-lg border border-border bg-card shadow-sm">
            <h1 className="text-3xl font-bold tracking-tight">
              Settings
            </h1>
            <p className="mt-2 text-sm text-muted-foreground font-medium">
              Optimize your trading workspace and personalize your professional interface.
            </p>
          </header>

          <div className="grid lg:grid-cols-12 gap-8">
            {/* Sidebar Navigation */}
            <div className="lg:col-span-3 space-y-2">
              {[
                { id: "appearance", label: "Appearance", icon: <FiLayout className="text-lg" /> },
              ].map(tab => (
                <Button 
                  key={tab.id}
                  variant={activeTab === tab.id ? "default" : "ghost"}
                  onClick={() => setActiveTab(tab.id)}
                  className="w-full flex items-center justify-start gap-4 h-12 rounded-md font-bold text-xs uppercase tracking-widest"
                >
                  {tab.icon} {tab.label}
                </Button>
              ))}
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-9 transition-all duration-300">
              
              {/* --- APPEARANCE TAB --- */}
              {activeTab === "appearance" && (
                <Card className="rounded-lg border border-border bg-card shadow-lg transition-all duration-300">
                  <CardHeader className="flex flex-row items-center gap-5 border-b border-border mb-6 p-8">
                    <div className="p-3 rounded-lg bg-primary/10 text-primary">
                      <FiMonitor className="text-2xl" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold">Workspace Theme</CardTitle>
                      <CardDescription className="text-sm font-medium">Choose your preferred visual environment.</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Light Mode Card */}
                      <div 
                        onClick={() => setTheme('light')}
                        className={`group relative overflow-hidden cursor-pointer rounded-lg border-2 transition-all duration-200 ${
                          theme === 'light' ? 'border-primary ring-2 ring-primary/10' : 'border-border bg-muted/20'
                        }`}
                      >
                        <div className="p-6">
                          <div className="aspect-[16/10] rounded-md bg-white shadow-inner border border-border relative overflow-hidden mb-6">
                            <div className="absolute top-4 left-4 w-12 h-2 bg-gray-200 rounded-full" />
                            <div className="absolute top-8 left-4 w-20 h-1.5 bg-gray-100 rounded-full" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <FiSun className={`text-4xl transform transition-transform group-hover:scale-110 ${theme === 'light' ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'light' ? 'text-foreground' : 'text-muted-foreground'}`}>System Light</span>
                            {theme === 'light' && <FiCheck className="text-primary" />}
                          </div>
                        </div>
                      </div>

                      {/* Dark Mode Card */}
                      <div 
                        onClick={() => setTheme('dark')}
                        className={`group relative overflow-hidden cursor-pointer rounded-lg border-2 transition-all duration-200 ${
                          theme === 'dark' ? 'border-primary ring-2 ring-primary/10' : 'border-border bg-muted/20'
                        }`}
                      >
                        <div className="p-6">
                          <div className="aspect-[16/10] rounded-md bg-[#020817] shadow-inner border border-border relative overflow-hidden mb-6">
                            <div className="absolute top-4 left-4 w-12 h-2 bg-white/10 rounded-full" />
                            <div className="absolute top-8 left-4 w-20 h-1.5 bg-white/5 rounded-full" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <FiMoon className={`text-4xl transform transition-transform group-hover:scale-110 ${theme === 'dark' ? 'text-primary' : 'text-muted-foreground'}`} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${theme === 'dark' ? 'text-foreground' : 'text-muted-foreground'}`}>System Dark</span>
                            {theme === 'dark' && <FiCheck className="text-primary" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Settings;
