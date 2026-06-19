"use client";

import { useEffect, useState } from "react";
import { getDashboardStats } from "@/lib/dashboard.api";
import { apiFetch } from "@/lib/apiClient";
import { 
  Heart, 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  Play, 
  HelpCircle, 
  ShieldAlert, 
  FileText, 
  Calendar, 
  ArrowRight, 
  MessageSquare, 
  Briefcase,
  Crown,
  User,
  Coins,
  Send,
  TrendingUp,
  X,
  Settings,
  BookOpen,
  Shield,
  Lock,
  CheckCircle2,
  FileQuestion,
  Sparkles,
  Info
} from "lucide-react";

import BusinessInfoForm from "./BusinessInfoForm";
import FAQForm from "./FAQForm";
import AISettingsForm from "./AISettingsForm";
import KnowledgeList from "@/components/knowledgeBase/KnowledgeList";

interface BackendWorkforceItem {
  name: string;
  role: string;
  status: string;
  lastActivity: string;
  focus: string;
  escalations: number;
}

type WorkforceViewProps = {
  clientId?: string;
};

// Frontend detailed metadata mapping for directory view
const employeeDetails: Record<string, {
  department: string;
  role: string;
  mission: string;
  responsibilities: string[];
  capabilities: string[];
  permissions: string[];
}> = {
  "Manager AI": {
    department: "AI Manager",
    role: "👑 AI Manager",
    mission: "Supervise autonomous systems, coordinate departments, and manage human handovers.",
    responsibilities: [
      "Reviewing system health logs and queue operations",
      "Managing human escalations and priority handover triggers",
      "Coordinating messaging threads across active systems"
    ],
    capabilities: ["Priority Management", "Department Supervision", "Human Escalation Handling"],
    permissions: ["Admin System Diagnostics Read", "Escalation Queue Actions", "Cross-Department Routing"]
  },
  "Sales AI": {
    department: "Sales AI",
    role: "Enterprise Sales Executive",
    mission: "Close qualified leads automatically, generate revenue, and handle negotiations.",
    responsibilities: [
      "Engaging inbound prospects with natural conversational closing",
      "Handling price objections and negotiating contract terms",
      "Booking qualified appointment slots on company calendar"
    ],
    capabilities: ["Negotiation", "Lead Qualification", "Follow-ups", "Replies", "CRM Updates"],
    permissions: ["Leads Database Write", "WhatsApp Message Reply", "Instagram DM Access", "Plan Feature CRM Sync"]
  },
  "Marketing AI": {
    department: "Marketing AI",
    role: "Marketing Automation Specialist",
    mission: "Create campaign templates, execute automation sequences, and nurture cold leads.",
    responsibilities: [
      "Triggering outreach flows based on lead intent indicators",
      "Executing sequence cadences and scheduled messaging drops",
      "Monitoring campaign statistics and execution logs"
    ],
    capabilities: ["Lead Nurturing", "Automation Flows", "Follow-ups"],
    permissions: ["Outreach Database Access", "Campaign Run Trigger", "Flow Executions Log Read"]
  },
  "Success AI": {
    department: "Customer Success AI",
    role: "Success Closer & Support Agent",
    mission: "Resolve client questions, provide policy details, and route complex cases.",
    responsibilities: [
      "Answering customer inquiries using brand FAQ databases",
      "Helping customers navigate billing, setup, and settings",
      "Detecting frustration and routing threads to human operators"
    ],
    capabilities: ["Replies", "FAQ Resolutions", "Customer Handover"],
    permissions: ["FAQ Database Read", "Customer Workspace Sync", "Frustration Alert Emit"]
  },
  "Operations AI": {
    department: "Operations AI",
    role: "Operations & Booking Coordinator",
    mission: "Monitor event queues, sync scheduling requests, and manage booking confirmations.",
    responsibilities: [
      "Parsing date/time choices from active conversations",
      "Checking scheduler calendars for real availability conflict checks",
      "Creating and confirming customer appointments"
    ],
    capabilities: ["Scheduling", "Booking Management", "Calendar Sync"],
    permissions: ["Calendar Appointments Write", "Booking Slots Availability Read", "Scheduler Settings Access"]
  },
  "Finance AI": {
    department: "Finance AI",
    role: "Finance Analyst & Quota Auditor",
    mission: "Track revenue touch points, analyze billing metrics, and report plan usage.",
    responsibilities: [
      "Verifying conversion deals values and ledger logs",
      "Auditing active API calls count and limit checks",
      "Reporting plan quota allocation alerts to the founder"
    ],
    capabilities: ["Revenue Tracking", "Billing Audits"],
    permissions: ["Revenue Ledger Records Read", "System Usage Counters Write", "Billing Plan Status Read"]
  }
};

export default function WorkforceView({ clientId = "" }: WorkforceViewProps) {
  const [workforce, setWorkforce] = useState<BackendWorkforceItem[]>([]);
  const [clientStatus, setClientStatus] = useState<any>(null);
  const [businessInfo, setBusinessInfo] = useState<string>("");
  const [faqs, setFaqs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [knowledgeList, setKnowledgeList] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State
  const [activeProfile, setActiveProfile] = useState<BackendWorkforceItem | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<"overview" | "training" | "diagnostics">("overview");

  const fetchAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";

      const [statsRes, statusRes, businessRes, faqRes, settingsRes, knowledgeRes] = await Promise.all([
        getDashboardStats().catch(err => { console.error("Stats fail:", err); return { success: false, data: null }; }),
        apiFetch("/api/client/status").catch(err => { console.error("Status fail:", err); return { success: false, data: null }; }),
        apiFetch(`/api/training/business${query}`).catch(err => { console.error("Business fail:", err); return { success: false, data: null }; }),
        apiFetch(`/api/training/faq${query}`).catch(err => { console.error("FAQ fail:", err); return { success: false, data: null }; }),
        apiFetch(`/api/training/settings${query}`).catch(err => { console.error("Settings fail:", err); return { success: false, data: null }; }),
        apiFetch(`/api/knowledge${query}`).catch(err => { console.error("Knowledge fail:", err); return { success: false, data: null }; })
      ]);

      if (statsRes?.success && statsRes?.data) {
        setWorkforce(statsRes.data.workforceHealth || []);
      }
      if (statusRes?.success && statusRes?.data) {
        setClientStatus(statusRes.data);
      }
      if (businessRes?.success && businessRes?.data) {
        setBusinessInfo(businessRes.data?.content || "");
      }
      if (faqRes?.success) {
        setFaqs(Array.isArray(faqRes.data) ? faqRes.data : []);
      }
      if (settingsRes?.success && settingsRes?.data) {
        setSettings(settingsRes.data);
      }
      if (knowledgeRes?.success && knowledgeRes?.data) {
        setKnowledgeList(Array.isArray(knowledgeRes.data?.knowledge) ? knowledgeRes.data?.knowledge : []);
      }
    } catch (err) {
      console.error("Error fetching workforce command center stats:", err);
      setError("An unexpected error occurred while loading the AI workforce directory");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAllData();
  }, [clientId]);

  // Determine state mapping cleanly
  const mapState = (status: string) => {
    switch (status) {
      case "Healthy":
        return "Ready";
      case "Busy":
        return "Processing";
      case "Needs Attention":
        return "Paused";
      default:
        return "Idle";
    }
  };

  // Determine knowledge configuration status dynamically using real DB counters
  const getKnowledgeStatus = (aiName: string) => {
    const hasBusinessInfo = Boolean(businessInfo?.trim());
    const hasFaqs = faqs.length > 0;
    const hasDocuments = knowledgeList.length > 0;
    const hasInstructions = Boolean(settings?.salesInstructions?.trim());

    if (aiName === "Manager AI" || aiName === "Finance AI") {
      return "Ready";
    }
    
    if (aiName === "Sales AI") {
      if (hasBusinessInfo && hasFaqs && hasDocuments && hasInstructions) return "Ready";
      if (hasDocuments) return "Knowledge Base Connected";
      if (hasBusinessInfo || hasFaqs) return "Knowledge Base Connected";
      return "Knowledge Base Missing";
    }
    
    if (aiName === "Success AI" || aiName === "Customer Success AI") {
      if (hasBusinessInfo && hasFaqs) return "Ready";
      if (hasFaqs || hasDocuments) return "Knowledge Base Connected";
      return "Waiting for Documents";
    }
    
    if (aiName === "Marketing AI" || aiName === "Operations AI") {
      if (hasBusinessInfo) return "Ready";
      return "Waiting for Documents";
    }
    
    return "Ready";
  };

  // Evaluate enabled status for capability badge based on integrations checks
  const getCapabilitiesList = (aiName: string) => {
    const defaultData = employeeDetails[aiName] || employeeDetails["Sales AI"];
    const hasChannels = Boolean(clientStatus?.instagram?.connected || clientStatus?.whatsapp?.connected);
    const hasCrm = settings?.clientId ? true : (clientStatus?.instagram?.connected || clientStatus?.whatsapp?.connected); // Safe fallback estimation

    return defaultData.capabilities.map(cap => {
      if (cap === "Replies" || cap === "Follow-ups") {
        return { name: cap, enabled: hasChannels, reason: "Requires Active WhatsApp or Instagram connection" };
      }
      if (cap === "CRM Updates") {
        return { name: cap, enabled: hasCrm, reason: "Requires Active Leads Integration" };
      }
      return { name: cap, enabled: true };
    });
  };

  const renderAIAvatar = (name: string, size = "md") => {
    const sizeClasses = size === "lg" ? "h-16 w-16 text-2xl border-4" : "h-12 w-12 text-lg border-2";
    const iconSize = size === "lg" ? 26 : 18;

    switch (name) {
      case "Manager AI":
        return (
          <div className={`flex items-center justify-center rounded-full bg-slate-50 text-slate-700 border-slate-200/90 shadow-sm ${sizeClasses}`}>
            <Crown size={iconSize} />
          </div>
        );
      case "Sales AI":
        return (
          <div className={`flex items-center justify-center rounded-full bg-blue-50 text-blue-600 border-blue-100/90 shadow-sm ${sizeClasses}`}>
            <Coins size={iconSize} />
          </div>
        );
      case "Marketing AI":
        return (
          <div className={`flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 border-indigo-100/90 shadow-sm ${sizeClasses}`}>
            <Send size={iconSize} />
          </div>
        );
      case "Success AI":
        return (
          <div className={`flex items-center justify-center rounded-full bg-pink-50 text-pink-600 border-pink-100/90 shadow-sm ${sizeClasses}`}>
            <Heart size={iconSize} />
          </div>
        );
      case "Operations AI":
        return (
          <div className={`flex items-center justify-center rounded-full bg-amber-50 text-amber-600 border-amber-100/90 shadow-sm ${sizeClasses}`}>
            <Calendar size={iconSize} />
          </div>
        );
      case "Finance AI":
        return (
          <div className={`flex items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border-emerald-100/90 shadow-sm ${sizeClasses}`}>
            <TrendingUp size={iconSize} />
          </div>
        );
      default:
        return (
          <div className={`flex items-center justify-center rounded-full bg-slate-50 text-slate-650 border-slate-200 shadow-sm ${sizeClasses}`}>
            <User size={iconSize} />
          </div>
        );
    }
  };

  if (loading && workforce.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        <p className="text-xs font-semibold text-slate-500 tracking-wider">Syncing Workforce Operational Logs...</p>
      </div>
    );
  }

  if (error && workforce.length === 0) {
    return (
      <div className="rounded-2xl border border-red-150 bg-red-50/20 p-6 text-center max-w-xl mx-auto my-8">
        <ShieldAlert className="mx-auto text-red-500 mb-3" size={32} />
        <h3 className="text-sm font-bold text-red-800 mb-1">Operational Sync Failure</h3>
        <p className="text-xs text-red-650 leading-relaxed mb-4">{error}</p>
        <button 
          onClick={() => void fetchAllData()} 
          className="brand-button-primary text-xs py-2 px-4 rounded-xl"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 👑 Top AI Workforce Overview Header */}
      <div className="flex flex-col gap-4 pb-6 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Headquarters Control</p>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-900">AI WORKFORCE OVERVIEW</h2>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200/80 px-3.5 py-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Integrity Sync Verified
          </div>
        </div>

        <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-4xl">
          Your AI workforce is ready. Each department operates independently and continuously improves using your company knowledge. 
          Currently orchestrating <strong>{workforce.length}</strong> active departments using real-time database transactions, event queues, and state machines.
        </p>
      </div>

      {/* 👥 Employee Directory Cards Grid */}
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {workforce.map((ai) => {
          const mappedName = ai.name === "Success AI" ? "Customer Success AI" : ai.name;
          const details = employeeDetails[ai.name] || {
            department: mappedName,
            role: ai.role,
            mission: ai.focus || "Awaiting delegation parameters.",
            responsibilities: ["Fulfill system integrations actions"],
            capabilities: [],
            permissions: []
          };

          const activeState = mapState(ai.status);
          const knowledgeState = getKnowledgeStatus(ai.name);
          const capabilitiesList = getCapabilitiesList(ai.name);

          return (
            <div
              key={ai.name}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md hover:border-slate-350"
            >
              <div className="p-5 space-y-4">
                {/* ID Header card design */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    {renderAIAvatar(ai.name)}
                    <div>
                      <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider block">
                        {details.department}
                      </span>
                      <h4 className="text-sm font-bold text-slate-800 leading-tight">
                        {details.role}
                      </h4>
                    </div>
                  </div>
                </div>

                {/* Mission Statement block */}
                <div className="rounded-xl bg-slate-50/70 border border-slate-100 p-3">
                  <span className="text-[9px] uppercase font-bold text-slate-400 tracking-widest block mb-1">
                    Primary Mission
                  </span>
                  <p className="text-xs text-slate-650 leading-relaxed font-medium">
                    {details.mission}
                  </p>
                </div>

                {/* State Indicators */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-slate-450 tracking-wider block mb-1">
                      Current State
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border uppercase ${
                      activeState === "Ready"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : activeState === "Processing"
                        ? "bg-blue-50 text-blue-700 border-blue-100"
                        : activeState === "Paused"
                        ? "bg-amber-50 text-amber-700 border-amber-100"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>
                      <span className={`h-1 w-1 rounded-full ${
                        activeState === "Ready"
                          ? "bg-emerald-500"
                          : activeState === "Processing"
                          ? "bg-blue-500 animate-pulse"
                          : activeState === "Paused"
                          ? "bg-amber-500"
                          : "bg-slate-450"
                      }`} />
                      {activeState}
                    </span>
                  </div>

                  <div>
                    <span className="text-[9px] uppercase font-bold text-slate-450 tracking-wider block mb-1">
                      Knowledge Link
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border ${
                      knowledgeState === "Ready"
                        ? "bg-blue-50 text-blue-700 border-blue-100"
                        : knowledgeState === "Knowledge Base Connected"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>
                      {knowledgeState}
                    </span>
                  </div>
                </div>

                {/* Badges section */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[9px] uppercase font-bold text-slate-450 tracking-wider block">
                    Capabilities
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {capabilitiesList.map((cap) => (
                      <span
                        key={cap.name}
                        title={cap.enabled ? "" : cap.reason}
                        className={`text-[9px] px-2 py-0.5 rounded-md font-semibold border ${
                          cap.enabled 
                            ? "bg-white text-slate-700 border-slate-200" 
                            : "bg-slate-50 text-slate-400 border-slate-100 opacity-60 line-through cursor-not-allowed"
                        }`}
                      >
                        {cap.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action trigger footer */}
              <div className="bg-slate-50/50 border-t border-slate-150 p-4">
                <button
                  onClick={() => {
                    setActiveProfile(ai);
                    setActiveProfileTab("overview");
                  }}
                  className="w-full text-center text-xs font-bold text-slate-700 bg-white border border-slate-250 rounded-xl py-2 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
                >
                  Open AI Profile
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 📁 Premium Personal File Folder Overlay Modal */}
      {activeProfile && (() => {
        const details = employeeDetails[activeProfile.name] || employeeDetails["Sales AI"];
        const mappedName = activeProfile.name === "Success AI" ? "Customer Success AI" : activeProfile.name;
        const capabilitiesList = getCapabilitiesList(activeProfile.name);

        const hasBusinessInfo = Boolean(businessInfo?.trim());
        const hasFaqs = faqs.length > 0;
        const hasDocuments = knowledgeList.length > 0;
        const hasInstructions = Boolean(settings?.salesInstructions?.trim());

        const isSales = activeProfile.name === "Sales AI";
        const isSuccess = activeProfile.name === "Success AI";
        const isEditable = isSales || isSuccess;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto">
            <div className="relative w-full max-w-5xl bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[620px] max-h-[85vh]">
              
              {/* Close Button */}
              <button
                onClick={() => {
                  setActiveProfile(null);
                  void fetchAllData(); // Refresh directory parameters when closing modal
                }}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition z-10"
              >
                <X size={18} />
              </button>

              {/* Left Sidebar: ID & Permissions */}
              <div className="w-full md:w-80 bg-slate-50/80 border-r border-slate-200 p-6 flex flex-col justify-between shrink-0 overflow-y-auto">
                <div className="space-y-6">
                  {/* Identity Header */}
                  <div className="flex flex-col items-center text-center space-y-3 pt-4">
                    {renderAIAvatar(activeProfile.name, "lg")}
                    <div>
                      <span className="text-[10px] uppercase font-extrabold text-slate-400 tracking-widest block">
                        {mappedName}
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 mt-0.5 leading-tight">
                        {details.role}
                      </h3>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold border uppercase ${
                      mapState(activeProfile.status) === "Ready"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : mapState(activeProfile.status) === "Processing"
                        ? "bg-blue-50 text-blue-700 border-blue-100"
                        : "bg-amber-50 text-amber-700 border-amber-100"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        mapState(activeProfile.status) === "Ready"
                          ? "bg-emerald-500"
                          : mapState(activeProfile.status) === "Processing"
                          ? "bg-blue-500 animate-pulse"
                          : "bg-amber-500"
                      }`} />
                      {mapState(activeProfile.status)}
                    </span>
                  </div>

                  <hr className="border-slate-200" />

                  {/* Focus & Handover status */}
                  <div className="space-y-3">
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Current Focus</span>
                      <p className="text-xs text-slate-700 mt-1 font-medium leading-relaxed bg-white border border-slate-100 rounded-xl p-2.5 shadow-sm">
                        {activeProfile.focus || "Awaiting task logs."}
                      </p>
                    </div>

                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Operational Audit</span>
                      <div className="flex items-center justify-between text-xs text-slate-650 mt-1 leading-relaxed">
                        <span>Escalations Queue</span>
                        <span className={`font-bold ${activeProfile.escalations > 0 ? "text-amber-600 animate-pulse" : "text-slate-500"}`}>
                          {activeProfile.escalations} handover requests
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-650 mt-1 leading-relaxed">
                        <span>Last Active Timestamp</span>
                        <span className="font-semibold text-[11px] text-slate-700">{activeProfile.lastActivity || "System Startup"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Permissions section */}
                  <div className="space-y-2 pt-2">
                    <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">System Permissions</span>
                    <div className="space-y-1.5">
                      {details.permissions.map(perm => (
                        <div key={perm} className="flex items-start gap-2 text-xs text-slate-600 leading-snug">
                          <Shield size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                          <span>{perm}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest leading-relaxed text-center">
                    Authorized Guardrail Stack v3.0
                  </p>
                </div>
              </div>

              {/* Right Content Area: Forms and diagnostics */}
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
                
                {/* Horizontal Navigation bar */}
                <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 pt-3 gap-2 shrink-0">
                  <button
                    onClick={() => setActiveProfileTab("overview")}
                    className={`px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider border-b-2 transition ${
                      activeProfileTab === "overview"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Overview & Responsibilities
                  </button>
                  <button
                    onClick={() => setActiveProfileTab("training")}
                    className={`px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider border-b-2 transition ${
                      activeProfileTab === "training"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Training & Directives
                  </button>
                  <button
                    onClick={() => setActiveProfileTab("diagnostics")}
                    className={`px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider border-b-2 transition ${
                      activeProfileTab === "diagnostics"
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Operational Diagnostics
                  </button>
                </div>

                {/* Tab Views Scroll Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  
                  {/* TAB 1: OVERVIEW */}
                  {activeProfileTab === "overview" && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Job Mission</h4>
                        <p className="text-sm text-slate-650 leading-relaxed font-medium bg-slate-50/50 border border-slate-100 rounded-2xl p-4">
                          {details.mission}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Key Operational Responsibilities</h4>
                        <div className="space-y-2.5">
                          {details.responsibilities.map((resp, i) => (
                            <div key={resp} className="flex gap-3 bg-white border border-slate-150 rounded-2xl p-3 shadow-sm hover:border-slate-200">
                              <span className="flex h-5 w-5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 items-center justify-center shrink-0">
                                {i + 1}
                              </span>
                              <p className="text-xs text-slate-650 leading-relaxed font-medium">{resp}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Capabilities badges section */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Operational Capabilities Status</h4>
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
                          {capabilitiesList.map(cap => (
                            <div 
                              key={cap.name} 
                              className={`flex items-center justify-between rounded-xl border p-3 ${
                                cap.enabled 
                                  ? "bg-emerald-50/20 border-emerald-100 text-emerald-800" 
                                  : "bg-slate-50 border-slate-150 text-slate-400 opacity-60"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {cap.enabled ? (
                                  <CheckCircle2 size={14} className="text-emerald-500" />
                                ) : (
                                  <Lock size={12} className="text-slate-400" />
                                )}
                                <span className="text-xs font-bold">{cap.name}</span>
                              </div>
                              {!cap.enabled && (
                                <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                                  Locked
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Personality */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">AI Personality Profile</h4>
                        {isSales && settings?.aiTone ? (
                          <div className="flex items-center gap-2 bg-blue-50/30 border border-blue-100 rounded-2xl p-4 text-xs font-semibold text-blue-800">
                            <Sparkles size={14} className="text-blue-500" />
                            <span>Tone Preference configured as &quot;{settings.aiTone}&quot;</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 bg-slate-50 border border-slate-150 rounded-2xl p-4 text-xs font-semibold text-slate-400 border-dashed">
                            <FileQuestion size={14} className="text-slate-400" />
                            <span>No training data available.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 2: TRAINING & DIRECTIVES */}
                  {activeProfileTab === "training" && (
                    <div className="space-y-6">
                      
                      {isEditable ? (
                        <>
                          <div className="bg-slate-50/80 border border-slate-150 rounded-2xl p-4 flex gap-3 text-xs text-slate-600 leading-relaxed mb-4">
                            <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                            <p>
                              You are training the <strong>{mappedName}</strong>. 
                              Updates to these company profiles, FAQ lists, and system settings are compiled immediately and sync with active conversational closure processes.
                            </p>
                          </div>

                          {/* Directives (AISettingsForm) */}
                          {isSales && (
                            <div className="space-y-3">
                              <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">Directives & Conversation Style</h4>
                              {!hasInstructions && (
                                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 font-medium">
                                  No custom instructions yet.
                                </div>
                              )}
                              <AISettingsForm clientId={clientId} />
                            </div>
                          )}

                          {/* Company Context Knowledge (BusinessInfoForm) */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">Company Knowledge Profile</h4>
                            {!hasBusinessInfo && (
                              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 font-medium">
                                Waiting for company information.
                              </div>
                            )}
                            <BusinessInfoForm clientId={clientId} />
                          </div>

                          {/* FAQs (FAQForm) */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">FAQ Database</h4>
                            {!hasFaqs && (
                              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-150 rounded-xl px-3 py-2 font-medium border-dashed">
                                No training data available.
                              </div>
                            )}
                            <FAQForm clientId={clientId} />
                          </div>

                          {/* Documents (KnowledgeList) */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-widest">Knowledge Base Documents</h4>
                            {!hasDocuments && (
                              <div className="space-y-2">
                                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 font-medium">
                                  No documents connected.
                                </div>
                                <div className="text-xs text-slate-500 bg-slate-50 border border-slate-150 rounded-xl px-3 py-2 font-medium border-dashed">
                                  Knowledge base not configured.
                                </div>
                              </div>
                            )}
                            <KnowledgeList clientId={clientId} />
                          </div>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-10 text-center max-w-xl mx-auto">
                          <Lock size={32} className="mx-auto text-slate-350 mb-3" />
                          <h4 className="text-sm font-bold text-slate-800 mb-1">Directives Training Locked</h4>
                          <p className="text-xs text-slate-450 leading-relaxed mb-4">
                            This department operates under global core system guardrails. Custom directives training is not available.
                          </p>
                          <div className="inline-block text-xs font-bold text-slate-500 border border-slate-200 rounded-xl px-4 py-2 bg-white">
                            No training data available.
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: DIAGNOSTICS & ACTIVITY */}
                  {activeProfileTab === "diagnostics" && (
                    <div className="space-y-6">
                      
                      {/* Learning Status */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Learning Status</h4>
                        <div className="rounded-2xl border border-slate-150 bg-white p-4 shadow-sm">
                          {isEditable ? (
                            <div className="flex items-start gap-3">
                              <span className={`p-1.5 rounded-full shrink-0 ${hasBusinessInfo || hasDocuments ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                                {hasBusinessInfo || hasDocuments ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                              </span>
                              <div>
                                <p className="text-xs font-bold text-slate-800">
                                  {hasBusinessInfo || hasDocuments ? "Operational & Synchronized" : "Awaiting Company Training Inputs"}
                                </p>
                                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                                  {hasBusinessInfo || hasDocuments 
                                    ? "Knowledge profile contains business definitions and custom documents. Conversational closer processes can retrieve contextual answers." 
                                    : "Company description is empty and no document resources are linked. Awaiting folder uploads to seed context embeddings."
                                  }
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3">
                              <span className="p-1.5 rounded-full bg-emerald-50 text-emerald-600 shrink-0">
                                <CheckCircle2 size={16} />
                              </span>
                              <div>
                                <p className="text-xs font-bold text-slate-800">System Directives Operational</p>
                                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                                  Department runs on core system logic and registers transactions normally on the db event bus.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Recent Learning Activity */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Recent Learning Activity</h4>
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs font-semibold text-slate-400">
                          No training data available.
                        </div>
                      </div>

                      {/* Training History */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Training History</h4>
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs font-semibold text-slate-400">
                          No training data available.
                        </div>
                      </div>

                    </div>
                  )}

                </div>

                {/* Profile modal action footer */}
                <div className="border-t border-slate-200 bg-slate-50/50 p-4 flex justify-end shrink-0">
                  <button
                    onClick={() => {
                      setActiveProfile(null);
                      void fetchAllData(); // Refresh directory parameters when closing modal
                    }}
                    className="brand-button-primary text-xs py-2 px-5 rounded-xl font-bold"
                  >
                    Close Profile Folder
                  </button>
                </div>

              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
}
