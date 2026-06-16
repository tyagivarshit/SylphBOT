"use client";

import { useState, useMemo, useEffect, useCallback, memo } from "react";
import {
  Workflow,
  Calendar,
  CreditCard,
  Play,
  Pause,
  Edit3,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  CheckCircle,
  X,
  FolderHeart,
  Activity,
  BarChart3,
  Settings,
  Clock,
  ArrowRight,
  Sliders,
  Shield,
  Layers,
  Heart,
  BookOpen
} from "lucide-react";
import { toast } from "react-hot-toast";
import { api } from "@/lib/api";

type FlowStatus = "Active" | "Paused" | "Draft";
type FlowType =
  | "Lead Follow-up"
  | "Comment → DM Funnel"
  | "Meeting Reminder"
  | "Lead Reactivation"
  | "Payment Recovery"
  | "Review Request Campaign";

interface FlowCardData {
  id: string;
  name: string;
  status: FlowStatus;
  type: FlowType;
  triggerType: string;
  executionsCount: number;
  conversionCount: number;
  revenueInfluenced: number;
  lastExecuted: string;
}

const INITIAL_FLOWS: FlowCardData[] = [
  {
    id: "flow-1",
    name: "Elite Lead Follow-up",
    status: "Active",
    type: "Lead Follow-up",
    triggerType: "Instagram DM Inbound",
    executionsCount: 142,
    conversionCount: 48,
    revenueInfluenced: 360000,
    lastExecuted: "15 minutes ago",
  },
  {
    id: "flow-2",
    name: "Comment → DM Funnel",
    status: "Active",
    type: "Comment → DM Funnel",
    triggerType: "Instagram Comment Trigger",
    executionsCount: 89,
    conversionCount: 22,
    revenueInfluenced: 120000,
    lastExecuted: "3 hours ago",
  },
  {
    id: "flow-3",
    name: "Automated Meeting Reminder",
    status: "Active",
    type: "Meeting Reminder",
    triggerType: "Calendar Slot Booked",
    executionsCount: 231,
    conversionCount: 198,
    revenueInfluenced: 1485000,
    lastExecuted: "45 minutes ago",
  },
  {
    id: "flow-4",
    name: "VIP Lead Reactivation",
    status: "Active",
    type: "Lead Reactivation",
    triggerType: "WhatsApp 72h Idle",
    executionsCount: 94,
    conversionCount: 12,
    revenueInfluenced: 90000,
    lastExecuted: "1 day ago",
  },
  {
    id: "flow-5",
    name: "Payment Recovery System",
    status: "Paused",
    type: "Payment Recovery",
    triggerType: "Invoice Link Generated",
    executionsCount: 54,
    conversionCount: 22,
    revenueInfluenced: 165000,
    lastExecuted: "2 days ago",
  },
  {
    id: "flow-6",
    name: "Review Request Campaign",
    status: "Draft",
    type: "Review Request Campaign",
    triggerType: "Deal Closed Trigger",
    executionsCount: 0,
    conversionCount: 0,
    revenueInfluenced: 0,
    lastExecuted: "Never",
  },
];

const LOCAL_STORAGE_KEY = "automexia.growth_engine.flows.v2";

interface FlowCardProps {
  flow: FlowCardData;
  onToggleStatus: (id: string) => void;
  onOpenEdit: (flow: FlowCardData) => void;
}

const FlowCard = memo(({ flow, onToggleStatus, onOpenEdit }: FlowCardProps) => {
  const formatCardRevenue = (val: number) => {
    if (val === 0) return "₹0";
    if (val >= 100000) {
      return `₹${(val / 100000).toFixed(1)}L`;
    }
    return `₹${val.toLocaleString()}`;
  };

  return (
    <div className="group relative rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-blue-200 flex flex-col justify-between min-h-[200px]">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="font-bold text-slate-900 text-base truncate group-hover:text-blue-600 transition-colors">
              {flow.name}
            </h4>
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
              {flow.triggerType}
            </p>
          </div>
          
          <span
            className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              flow.status === "Active"
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : flow.status === "Paused"
                ? "bg-amber-50 text-amber-700 border-amber-100"
                : "bg-slate-50 text-slate-500 border-slate-200"
            }`}
          >
            {flow.status}
          </span>
        </div>

        {/* Highlighted Metric */}
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="text-xl font-black text-emerald-600">
            {formatCardRevenue(flow.revenueInfluenced)}
          </span>
          <span className="text-xs font-semibold text-slate-400">
            Revenue Influenced
          </span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-400">
          Last Executed: {flow.lastExecuted}
        </span>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenEdit(flow)}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition cursor-pointer"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onToggleStatus(flow.id)}
            className={`h-8 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
              flow.status === "Active"
                ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/50"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50"
            }`}
          >
            {flow.status === "Active" ? "Pause" : "Resume"}
          </button>
        </div>
      </div>
    </div>
  );
});
FlowCard.displayName = "FlowCard";

export default function GrowthEngineWorkspace() {
  const [activeTab, setActiveTab] = useState<string>("flows");
  const [flows, setFlows] = useState<FlowCardData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<FlowCardData | null>(null);
  const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<string | null>(null);

  // Form states
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowType, setNewFlowType] = useState<FlowType>("Lead Follow-up");
  const [newTriggerType, setNewTriggerType] = useState("Instagram DM Inbound");

  const [editFlowName, setEditFlowName] = useState("");
  const [editFlowType, setEditFlowType] = useState<FlowType>("Lead Follow-up");
  const [editTriggerType, setEditTriggerType] = useState("");

  // Settings State
  const [businessHours, setBusinessHours] = useState(true);
  const [duplicateProtection, setDuplicateProtection] = useState(true);
  const [fallbackBehaviour, setFallbackBehaviour] = useState("escalate");
  const [aiOptimizationMode, setAiOptimizationMode] = useState("balanced");

  // Load and merge flows
  useEffect(() => {
    let localFlows: FlowCardData[] = [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          localFlows = JSON.parse(stored);
        } else {
          localFlows = INITIAL_FLOWS;
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_FLOWS));
        }
      } catch (err) {
        console.error("Failed to load growth flows", err);
        localFlows = INITIAL_FLOWS;
      }
    }

    const loadMergedFlows = async () => {
      try {
        const response = await api.get("/comment-automation/triggers");
        const data = Array.isArray(response.data)
          ? response.data
          : response.data?.triggers || [];
        
        const backendFlows: FlowCardData[] = data.map((item: any) => ({
          id: `comment-trigger-${item.id}`,
          name: item.keyword ? `Comment Trigger: "${item.keyword}"` : "Comment → DM Funnel",
          status: item.isActive ? "Active" : "Paused",
          type: "Comment → DM Funnel",
          triggerType: item.keyword ? `Comment Keyword: "${item.keyword}"` : "Instagram Post Comment",
          executionsCount: item.triggerCount || 0,
          conversionCount: Math.round((item.triggerCount || 0) * 0.25),
          revenueInfluenced: (item.triggerCount || 0) * 4500,
          lastExecuted: item.lastTriggeredAt 
            ? `${new Date(item.lastTriggeredAt).toLocaleDateString()} at ${new Date(item.lastTriggeredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
            : "Never",
        }));

        const merged = [...localFlows];
        backendFlows.forEach((bf) => {
          if (!merged.some((f) => f.id === bf.id)) {
            merged.push(bf);
          }
        });
        setFlows(merged);
      } catch (err) {
        console.error("Failed to fetch backend triggers, using local storage flows", err);
        setFlows(localFlows);
      }
    };

    void loadMergedFlows();
  }, []);

  // Update default trigger type in creation modal depending on type selected
  useEffect(() => {
    const defaultTriggers: Record<FlowType, string> = {
      "Lead Follow-up": "Instagram DM Inbound",
      "Comment → DM Funnel": "Instagram Comment Trigger",
      "Meeting Reminder": "Calendar Slot Booked",
      "Lead Reactivation": "WhatsApp 72h Idle",
      "Payment Recovery": "Invoice Link Generated",
      "Review Request Campaign": "Deal Closed Trigger",
    };
    setNewTriggerType(defaultTriggers[newFlowType]);
  }, [newFlowType]);

  // Persist flows state helper
  const persistFlows = useCallback((nextFlows: FlowCardData[]) => {
    setFlows(nextFlows);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextFlows));
    } catch (err) {
      console.error("Failed to save growth flows", err);
    }
  }, []);

  // Snapshot calculations
  const activeAutomationsCount = useMemo(() => {
    return flows.filter((f) => f.status === "Active").length;
  }, [flows]);

  const totalRevenue = useMemo(() => {
    return flows.reduce((acc, curr) => acc + curr.revenueInfluenced, 0);
  }, [flows]);

  const totalConversions = useMemo(() => {
    return flows.reduce((acc, curr) => acc + curr.conversionCount, 0);
  }, [flows]);

  const growthHealth = useMemo(() => {
    if (flows.length === 0) return "Paused";
    const activeCount = flows.filter(f => f.status === "Active").length;
    const pausedCount = flows.filter(f => f.status === "Paused").length;

    if (activeCount === flows.length) return "Healthy";
    if (pausedCount === flows.length) return "Paused";
    if (activeCount > 0 && pausedCount > 0) return "Needs Optimization";
    return "Attention Required";
  }, [flows]);

  const getHealthBadgeStyle = (status: string) => {
    switch (status) {
      case "Healthy":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Needs Optimization":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Paused":
        return "bg-slate-50 text-slate-600 border-slate-200";
      case "Attention Required":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  // Filter & Search Logic
  const filteredFlows = useMemo(() => {
    return flows.filter((flow) => {
      const matchesSearch =
        flow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        flow.triggerType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        flow.type.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus =
        statusFilter === "all" ||
        flow.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [flows, searchQuery, statusFilter]);

  // Actions
  const handleToggleStatus = useCallback(
    async (id: string) => {
      const flowToUpdate = flows.find((f) => f.id === id);
      if (!flowToUpdate) return;

      const isCommentTrigger = id.startsWith("comment-trigger-");
      const realId = isCommentTrigger ? id.replace("comment-trigger-", "") : id;

      const nextStatus: FlowStatus = flowToUpdate.status === "Active" ? "Paused" : "Active";

      if (isCommentTrigger) {
        try {
          await api.patch(`/comment-triggers/${realId}/toggle`);
          toast.success(`Trigger ${nextStatus === "Active" ? "resumed" : "paused"} successfully.`);
        } catch (err) {
          console.error("Failed to toggle comment trigger", err);
          toast.error("Failed to update trigger status on server.");
          return;
        }
      }

      const updated = flows.map((flow) =>
        flow.id === id ? { ...flow, status: nextStatus } : flow
      );
      
      persistFlows(updated);
      if (!isCommentTrigger) {
        toast.success(
          nextStatus === "Active"
            ? `Flow "${flowToUpdate.name}" resumed.`
            : `Flow "${flowToUpdate.name}" paused.`
        );
      }
    },
    [flows, persistFlows]
  );

  const handleCreateFlow = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newFlowName.trim()) {
        toast.error("Please enter a name for the flow.");
        return;
      }

      const newFlow: FlowCardData = {
        id: `flow-${Date.now()}`,
        name: newFlowName.trim(),
        status: "Active",
        type: newFlowType,
        triggerType: newTriggerType.trim() || "Inbound Trigger",
        executionsCount: 0,
        conversionCount: 0,
        revenueInfluenced: 0,
        lastExecuted: "Never",
      };

      const updated = [...flows, newFlow];
      persistFlows(updated);
      setIsCreateModalOpen(false);
      setNewFlowName("");
      toast.success(`Flow "${newFlow.name}" created.`);
    },
    [flows, newFlowName, newFlowType, newTriggerType, persistFlows]
  );

  const handleOpenEdit = useCallback((flow: FlowCardData) => {
    setSelectedFlow(flow);
    setEditFlowName(flow.name);
    setEditFlowType(flow.type);
    setEditTriggerType(flow.triggerType);
    setIsEditModalOpen(true);
  }, []);

  const handleEditFlow = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedFlow) return;
      if (!editFlowName.trim()) {
        toast.error("Please enter a flow name.");
        return;
      }

      const updated = flows.map((flow) =>
        flow.id === selectedFlow.id
          ? {
              ...flow,
              name: editFlowName.trim(),
              type: editFlowType,
              triggerType: editTriggerType.trim() || "Inbound Trigger",
            }
          : flow
      );

      persistFlows(updated);
      setIsEditModalOpen(false);
      setSelectedFlow(null);
      toast.success("Flow updated.");
    },
    [flows, selectedFlow, editFlowName, editFlowType, editTriggerType, persistFlows]
  );

  const formatRevenue = (val: number) => {
    if (val === 0) return "₹0";
    if (val >= 100000) {
      return `₹${(val / 100000).toFixed(1)}L`;
    }
    return `₹${val.toLocaleString()}`;
  };

  const handleDeployTemplate = (templateName: string, type: FlowType, defaultTrigger: string) => {
    const newFlow: FlowCardData = {
      id: `flow-template-${Date.now()}`,
      name: templateName,
      status: "Active",
      type: type,
      triggerType: defaultTrigger,
      executionsCount: 0,
      conversionCount: 0,
      revenueInfluenced: 0,
      lastExecuted: "Never",
    };

    const updated = [...flows, newFlow];
    persistFlows(updated);
    toast.success(`Successfully deployed template "${templateName}".`);
    setActiveTab("flows");
  };

  // Performance calculations
  const performanceStats = useMemo(() => {
    const totalExecutions = flows.reduce((acc, f) => acc + f.executionsCount, 0);
    const totalConversions = flows.reduce((acc, f) => acc + f.conversionCount, 0);
    const conversionRate = totalExecutions > 0 ? ((totalConversions / totalExecutions) * 100).toFixed(1) + "%" : "0%";

    const sortedByRevenue = [...flows].sort((a, b) => b.revenueInfluenced - a.revenueInfluenced);
    const topFlow = sortedByRevenue[0]?.name || "None";
    const bottomFlow = sortedByRevenue[sortedByRevenue.length - 1]?.name || "None";

    return {
      totalExecutions,
      conversionRate,
      topFlow,
      bottomFlow
    };
  }, [flows]);

  return (
    <div className="flex flex-col gap-6 w-full min-h-0 bg-transparent">
      
      {/* Growth Engine Header */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          GROWTH
        </span>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">
          Growth Engine
        </h2>
      </div>

      {/* Growth Snapshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Active Automations */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 px-6 py-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Active Automations
          </p>
          <h3 className="mt-2.5 text-2xl font-black text-slate-900">
            {activeAutomationsCount}
          </h3>
          <p className="mt-1.5 text-[11px] text-slate-400 font-medium">
            AI systems running live
          </p>
        </div>

        {/* Revenue Influenced */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 px-6 py-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Revenue Influenced
          </p>
          <h3 className="mt-2.5 text-2xl font-black text-emerald-600">
            {formatRevenue(totalRevenue)}
          </h3>
          <p className="mt-1.5 text-[11px] text-slate-400 font-medium">
            Attributed pipeline growth
          </p>
        </div>

        {/* Conversions Generated */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 px-6 py-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Conversions Generated
          </p>
          <h3 className="mt-2.5 text-2xl font-black text-slate-900">
            {totalConversions.toLocaleString()}
          </h3>
          <p className="mt-1.5 text-[11px] text-slate-400 font-medium">
            Key milestones accomplished
          </p>
        </div>

        {/* Growth Health */}
        <div className="rounded-3xl border border-slate-200/80 bg-white/90 px-6 py-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Growth Health
          </p>
          <div className="mt-2.5 flex items-center">
            <span
              className={`text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full border ${getHealthBadgeStyle(
                growthHealth
              )}`}
            >
              {growthHealth}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 font-medium">
            Derived from live status
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="sticky top-0 z-10 w-full bg-slate-50/90 pb-2 border-b border-slate-200/80 backdrop-blur-md">
        <div className="flex w-full overflow-x-auto no-scrollbar py-2">
          <div className="flex items-center gap-1.5 rounded-2xl bg-slate-200/60 p-1 backdrop-blur-xl">
            {[
              { id: "flows", label: "Flows", icon: Workflow },
              { id: "templates", label: "Templates", icon: FolderHeart },
              { id: "activity", label: "Activity", icon: Activity },
              { id: "performance", label: "Performance", icon: BarChart3 },
              { id: "settings", label: "Settings", icon: Settings },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold tracking-wide transition-all duration-150 focus:outline-none cursor-pointer
                    ${isActive ? "bg-white text-blue-600 shadow-sm border border-slate-200/10" : "text-slate-500 hover:text-slate-800"}
                  `}
                >
                  <Icon size={13} className={isActive ? "text-blue-600" : "text-slate-400"} />
                  <span className="whitespace-nowrap">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Selected Tab Content */}
      <div className="mt-4 flex-1">
        
        {/* Flows Tab */}
        {activeTab === "flows" && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              
              {/* Search */}
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search flows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 bg-white rounded-xl focus:border-blue-500 focus:outline-none shadow-sm font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Status Filters */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 border border-slate-200/50 shadow-inner w-full sm:w-auto overflow-x-auto">
                {[
                  { id: "all", label: "All Statuses" },
                  { id: "active", label: "Active" },
                  { id: "paused", label: "Paused" },
                  { id: "draft", label: "Draft" },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap flex-1 sm:flex-initial text-center ${
                      statusFilter === f.id
                        ? "bg-white text-blue-600 shadow-sm border border-slate-200/25"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Flows Grid */}
            {filteredFlows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/70 px-6 py-16 text-center">
                <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 mb-4 border border-blue-100/50">
                  <Workflow size={20} />
                </div>
                <h3 className="text-base font-bold text-slate-900">No active AI growth systems found.</h3>
                <p className="mt-1 text-xs text-slate-400 max-w-sm">
                  Create a new growth flow or deploy a proven template to start qualifying opportunities.
                </p>
                <div className="mt-6 flex gap-2">
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="brand-button-primary py-2 px-4 text-xs rounded-xl cursor-pointer"
                  >
                    Create Flow
                  </button>
                  <button
                    onClick={() => setActiveTab("templates")}
                    className="brand-button-secondary py-2 px-4 text-xs rounded-xl cursor-pointer border border-slate-200 hover:bg-slate-50 transition"
                  >
                    Browse Templates
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredFlows.map((flow) => (
                  <FlowCard
                    key={flow.id}
                    flow={flow}
                    onToggleStatus={handleToggleStatus}
                    onOpenEdit={handleOpenEdit}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === "templates" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1 max-w-md">
              <h3 className="text-base font-black text-slate-900">Proven Growth Blueprints</h3>
              <p className="text-xs text-slate-400">
                Deploy tested, deterministic workflows immediately onto your active channels.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  id: "tpl-insta",
                  title: "Instagram Lead Funnel",
                  desc: "Automatically qualifies comments on posts or reels and initiates a private DM followup conversation.",
                  type: "Comment → DM Funnel" as FlowType,
                  defaultTrigger: "Instagram Comment Trigger",
                },
                {
                  id: "tpl-booking",
                  title: "Appointment Booking Funnel",
                  desc: "Detects high intent triggers in messenger conversations and guides contacts straight to calendar scheduling.",
                  type: "Meeting Reminder" as FlowType,
                  defaultTrigger: "Calendar Slot Booked",
                },
                {
                  id: "tpl-reactivate",
                  title: "Lead Reactivation Funnel",
                  desc: "Identifies cold leads idle for over 72 hours and sends custom re-engagement prompts.",
                  type: "Lead Reactivation" as FlowType,
                  defaultTrigger: "WhatsApp 72h Idle",
                },
                {
                  id: "tpl-payment",
                  title: "Payment Recovery Funnel",
                  desc: "Politely contacts customers with open payment sessions or invoice links to recover transactions.",
                  type: "Payment Recovery" as FlowType,
                  defaultTrigger: "Invoice Link Generated",
                },
                {
                  id: "tpl-review",
                  title: "Review Collection Funnel",
                  desc: "Reaches out automatically after successful delivery milestones to request user reviews.",
                  type: "Review Request Campaign" as FlowType,
                  defaultTrigger: "Deal Closed Trigger",
                },
              ].map((template) => (
                <div key={template.id} className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm flex flex-col justify-between min-h-[220px]">
                  <div>
                    <span className="brand-chip brand-chip-dark text-[9px] uppercase font-bold tracking-wider mb-2">
                      Template
                    </span>
                    <h4 className="font-bold text-slate-900 text-base mt-2">
                      {template.title}
                    </h4>
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      {template.desc}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
                    <button
                      onClick={() => setSelectedTemplateForPreview(template.title)}
                      className="flex-1 h-9 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => handleDeployTemplate(template.title, template.type, template.defaultTrigger)}
                      className="flex-1 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"
                    >
                      Deploy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === "activity" && (
          <div className="flex flex-col gap-6 max-w-2xl">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-black text-slate-900">Recent Growth Events</h3>
              <p className="text-xs text-slate-400">
                A clean, chronological record of your autonomous system actions.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="relative border-l-2 border-slate-100 ml-3.5 pl-6 space-y-6">
                {[
                  { event: "Lead Follow-up executed", time: "15 minutes ago" },
                  { event: "Comment Funnel paused", time: "2 hours ago" },
                  { event: "Meeting Reminder edited", time: "1 day ago" },
                  { event: "Payment Recovery resumed", time: "2 days ago" },
                  { event: "Review Request Campaign created", time: "5 days ago" },
                ].map((item, index) => (
                  <div key={index} className="relative">
                    <span className="absolute -left-[31px] top-1 flex size-3 items-center justify-center rounded-full bg-white border-2 border-blue-500 shadow-sm">
                      <span className="size-1 rounded-full bg-blue-500" />
                    </span>
                    
                    <div className="flex items-center justify-between gap-4 text-xs font-semibold">
                      <span className="text-slate-800">{item.event}</span>
                      <span className="text-slate-400 text-[10px] whitespace-nowrap">{item.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === "performance" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-black text-slate-900">Business Impact Analytics</h3>
              <p className="text-xs text-slate-400">
                Revenue metrics and optimization performance rankings.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Revenue Influenced</p>
                <h4 className="text-2xl font-black text-emerald-600 mt-2">{formatRevenue(totalRevenue)}</h4>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Executions</p>
                <h4 className="text-2xl font-black text-slate-900 mt-2">{performanceStats.totalExecutions.toLocaleString()}</h4>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conversion Rate</p>
                <h4 className="text-2xl font-black text-indigo-600 mt-2">{performanceStats.conversionRate}</h4>
              </div>
            </div>

            {/* Performance Ranking */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
              <div className="rounded-3xl border border-slate-200 bg-emerald-50/30 p-5 shadow-sm border-l-4 border-l-emerald-500">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Top Performing Flow</p>
                <h4 className="text-base font-black text-slate-900 mt-2">{performanceStats.topFlow}</h4>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm border-l-4 border-l-slate-400">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Lowest Performing Flow</p>
                <h4 className="text-base font-black text-slate-900 mt-2">{performanceStats.bottomFlow}</h4>
              </div>
            </div>

            {/* SVG Chart */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm mt-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Revenue Growth (Last 6 Months)</p>
              <div className="w-full h-64">
                <svg className="w-full h-full" viewBox="0 0 600 240" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  
                  {/* Grid Lines */}
                  <line x1="50" y1="40" x2="550" y2="40" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="50" y1="90" x2="550" y2="90" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="50" y1="140" x2="550" y2="140" stroke="#f1f5f9" strokeWidth="1" />
                  <line x1="50" y1="190" x2="550" y2="190" stroke="#f1f5f9" strokeWidth="1" />

                  {/* Gradient Area */}
                  <path
                    d="M 50 190 Q 150 150 250 120 T 450 70 T 550 50 L 550 190 Z"
                    fill="url(#chart-gradient)"
                  />

                  {/* Area Line */}
                  <path
                    d="M 50 190 Q 150 150 250 120 T 450 70 T 550 50"
                    stroke="#3b82f6"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* Dots */}
                  <circle cx="50" cy="190" r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
                  <circle cx="150" cy="165" r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
                  <circle cx="250" cy="120" r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
                  <circle cx="350" cy="95" r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
                  <circle cx="450" cy="70" r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
                  <circle cx="550" cy="50" r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />

                  {/* Axis Text */}
                  <text x="50" y="215" fill="#94a3b8" fontSize="10" fontWeight="bold" textAnchor="middle">Jan</text>
                  <text x="150" y="215" fill="#94a3b8" fontSize="10" fontWeight="bold" textAnchor="middle">Feb</text>
                  <text x="250" y="215" fill="#94a3b8" fontSize="10" fontWeight="bold" textAnchor="middle">Mar</text>
                  <text x="350" y="215" fill="#94a3b8" fontSize="10" fontWeight="bold" textAnchor="middle">Apr</text>
                  <text x="450" y="215" fill="#94a3b8" fontSize="10" fontWeight="bold" textAnchor="middle">May</text>
                  <text x="550" y="215" fill="#94a3b8" fontSize="10" fontWeight="bold" textAnchor="middle">Jun</text>
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="flex flex-col gap-6 max-w-2xl">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-black text-slate-900">Engine Safety & Guardrails</h3>
              <p className="text-xs text-slate-400">
                Configure backoffice parameters, limits, and fallback routines.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              
              {/* Business Hours */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Enforce Business Hours</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Throttle outgoing AI outreach strictly to 9:00 AM - 6:00 PM local time.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={businessHours}
                    onChange={(e) => setBusinessHours(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Duplicate Protection */}
              <div className="flex items-center justify-between gap-4 pt-6 border-t border-slate-100">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Duplicate Protection Window</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Silently ignore triggers for active contacts if they were reached in the last 24 hours.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={duplicateProtection}
                    onChange={(e) => setDuplicateProtection(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Fallback Behaviour */}
              <div className="flex flex-col gap-2 pt-6 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-900">Uncertain Intent Fallback</h4>
                <p className="text-xs text-slate-500">
                  Configure default action when the AI model does not reach the 85% intent classification threshold.
                </p>
                <select
                  value={fallbackBehaviour}
                  onChange={(e) => setFallbackBehaviour(e.target.value)}
                  className="mt-2 w-full max-w-md px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-white font-semibold text-slate-800"
                >
                  <option value="escalate">Escalate immediately to Founder Workspace</option>
                  <option value="default_reply">Send default qualifying template</option>
                  <option value="pause_lead">Silently pause communication loop</option>
                </select>
              </div>

              {/* AI Optimization Mode */}
              <div className="flex flex-col gap-2 pt-6 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-900">AI Optimization Mode</h4>
                <p className="text-xs text-slate-500">
                  Select how aggressively the AI agent adapts tone and schedules follow-ups.
                </p>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {[
                    { id: "strict", label: "Strict Templates", desc: "No dynamic variation" },
                    { id: "balanced", label: "Balanced", desc: "Slight custom variations" },
                    { id: "autonomous", label: "High Autonomy", desc: "Dynamically generated context" }
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setAiOptimizationMode(mode.id)}
                      className={`p-3 rounded-2xl border text-left cursor-pointer transition ${
                        aiOptimizationMode === mode.id
                          ? "border-blue-500 bg-blue-50/20 text-blue-700 font-bold"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      <span className="block text-xs">{mode.label}</span>
                      <span className="block text-[10px] text-slate-400 font-normal mt-0.5">{mode.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => toast.success("Safety configuration saved successfully.")}
                  className="brand-button-primary px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                >
                  Save Configuration
                </button>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* Lightweight Creation Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="brand-panel-strong w-full max-w-md rounded-[28px] p-6 shadow-xl border border-slate-200/20 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-950">Create Growth Flow</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateFlow} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Flow Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lead Qualification follow-up"
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-slate-50/50"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Flow Type / Template
                </label>
                <select
                  value={newFlowType}
                  onChange={(e) => setNewFlowType(e.target.value as FlowType)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-white"
                >
                  <option value="Lead Follow-up">Lead Follow-up</option>
                  <option value="Comment → DM Funnel">Comment → DM Funnel</option>
                  <option value="Meeting Reminder">Meeting Reminder</option>
                  <option value="Lead Reactivation">Lead Reactivation</option>
                  <option value="Payment Recovery">Payment Recovery</option>
                  <option value="Review Request Campaign">Review Request Campaign</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Trigger Type
                </label>
                <input
                  type="text"
                  placeholder="e.g. WhatsApp Inbound, Lead Idle 48h"
                  value={newTriggerType}
                  onChange={(e) => setNewTriggerType(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-slate-50/50"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="brand-button-secondary py-2 px-4 text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="brand-button-primary py-2 px-4 text-xs rounded-xl cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  Create Flow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightweight Edit Modal */}
      {isEditModalOpen && selectedFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="brand-panel-strong w-full max-w-md rounded-[28px] p-6 shadow-xl border border-slate-200/20 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-950">Edit Flow Details</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleEditFlow} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Flow Name
                </label>
                <input
                  type="text"
                  value={editFlowName}
                  onChange={(e) => setEditFlowName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-slate-50/50"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Flow Type / Template
                </label>
                <select
                  value={editFlowType}
                  onChange={(e) => setEditFlowType(e.target.value as FlowType)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-white"
                >
                  <option value="Lead Follow-up">Lead Follow-up</option>
                  <option value="Comment → DM Funnel">Comment → DM Funnel</option>
                  <option value="Meeting Reminder">Meeting Reminder</option>
                  <option value="Lead Reactivation">Lead Reactivation</option>
                  <option value="Payment Recovery">Payment Recovery</option>
                  <option value="Review Request Campaign">Review Request Campaign</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Trigger Type
                </label>
                <input
                  type="text"
                  value={editTriggerType}
                  onChange={(e) => setEditTriggerType(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-slate-50/50"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="brand-button-secondary py-2 px-4 text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="brand-button-primary py-2 px-4 text-xs rounded-xl cursor-pointer bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Template Preview Modal */}
      {selectedTemplateForPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div className="brand-panel-strong w-full max-w-md rounded-[28px] p-6 shadow-xl border border-slate-200/20 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-950">{selectedTemplateForPreview} Sequence</h3>
              <button
                onClick={() => setSelectedTemplateForPreview(null)}
                className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Deterministic flow sequence mapped out for optimal engagement:
              </p>
              
              <div className="space-y-3 pl-2 border-l-2 border-blue-500">
                <div className="text-xs">
                  <span className="font-bold text-slate-800">Step 1: Event Trigger</span>
                  <p className="text-slate-400 text-[10px]">Detect incoming message / comment / schedule hook.</p>
                </div>
                <div className="text-xs">
                  <span className="font-bold text-slate-800">Step 2: Intent Validation</span>
                  <p className="text-slate-400 text-[10px]">Filter contacts through active duplicate protection parameters.</p>
                </div>
                <div className="text-xs">
                  <span className="font-bold text-slate-800">Step 3: Response Dispatch</span>
                  <p className="text-slate-400 text-[10px]">Generate response contextualized to customer intent and reply guidelines.</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setSelectedTemplateForPreview(null)}
                  className="brand-button-secondary py-2 px-5 text-xs rounded-xl cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
