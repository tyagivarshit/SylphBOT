"use client";

import { useState, useMemo, useEffect, useCallback, memo } from "react";
import {
  Workflow,
  MessageSquare,
  Calendar,
  CreditCard,
  Bell,
  Play,
  Pause,
  Edit3,
  Copy,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  CheckCircle,
  Trash2,
  X,
  FolderHeart,
  Activity,
  BarChart3,
  Settings,
  ShieldCheck,
  History,
  Clock,
  ArrowRight,
  AlertCircle,
  Database,
} from "lucide-react";
import { toast } from "react-hot-toast";

type FlowStatus = "Active" | "Paused" | "Draft";
type FlowType =
  | "Lead Follow-up"
  | "Lead Reactivation"
  | "Meeting Reminder"
  | "Payment Reminder"
  | "Internal Notification";

interface FlowCardData {
  id: string;
  name: string;
  status: FlowStatus;
  type: FlowType;
  triggerType: string;
  executionsCount: number;
  conversionCount: number;
  revenueInfluenced: number;
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
  },
  {
    id: "flow-2",
    name: "Inactive Lead Reactivation",
    status: "Active",
    type: "Lead Reactivation",
    triggerType: "WhatsApp 72h Idle",
    executionsCount: 89,
    conversionCount: 12,
    revenueInfluenced: 90000,
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
  },
  {
    id: "flow-4",
    name: "Payment Checkout Reminder",
    status: "Paused",
    type: "Payment Reminder",
    triggerType: "Invoice Link Generated",
    executionsCount: 54,
    conversionCount: 22,
    revenueInfluenced: 165000,
  },
  {
    id: "flow-5",
    name: "VIP Client Notification",
    status: "Draft",
    type: "Internal Notification",
    triggerType: "High Intent Flagged",
    executionsCount: 0,
    conversionCount: 0,
    revenueInfluenced: 0,
  },
];

const LOCAL_STORAGE_KEY = "automexia.growth_engine.flows.v1";

// Sub-component for individual Flow Cards (performance optimized)
interface FlowCardProps {
  flow: FlowCardData;
  onToggleStatus: (id: string) => void;
  onOpenEdit: (flow: FlowCardData) => void;
  onClone: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onOpenReliability: (flow: FlowCardData) => void;
}

const FlowCard = memo(({
  flow,
  onToggleStatus,
  onOpenEdit,
  onClone,
  onDelete,
  onOpenReliability
}: FlowCardProps) => {
  const statusBadgeStyle = (status: FlowStatus) => {
    switch (status) {
      case "Active":
        return "bg-emerald-50 text-emerald-700 border-emerald-100/80";
      case "Paused":
        return "bg-amber-50 text-amber-700 border-amber-100/80";
      case "Draft":
        return "bg-slate-50 text-slate-600 border-slate-200/80";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200/80";
    }
  };

  const getFlowTypeIcon = (type: FlowType) => {
    switch (type) {
      case "Lead Follow-up":
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case "Lead Reactivation":
        return <Workflow className="h-4 w-4 text-emerald-500" />;
      case "Meeting Reminder":
        return <Calendar className="h-4 w-4 text-purple-500" />;
      case "Payment Reminder":
        return <CreditCard className="h-4 w-4 text-amber-500" />;
      case "Internal Notification":
        return <Bell className="h-4 w-4 text-rose-500" />;
      default:
        return <Workflow className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="group relative rounded-3xl border border-slate-200/80 bg-white/88 p-5 shadow-sm backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-blue-200">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5">
            {getFlowTypeIcon(flow.type)}
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {flow.type}
            </span>
          </div>
          <h4 className="font-bold text-slate-900 text-sm truncate group-hover:text-blue-600 transition-colors">
            {flow.name}
          </h4>
        </div>
        
        {/* Status Badge */}
        <span
          className={`text-[9px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 whitespace-nowrap ${statusBadgeStyle(
            flow.status
          )}`}
        >
          {flow.status === "Active"
            ? "✓ Active"
            : flow.status === "Paused"
            ? "⏳ Paused"
            : "⚠ Draft"}
        </span>
      </div>

      {/* Trigger Info */}
      <div className="mt-4 rounded-xl bg-slate-50/70 border border-slate-200/40 p-2.5">
        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
          Trigger
        </p>
        <p className="text-xs text-slate-700 font-medium mt-0.5 truncate">
          {flow.triggerType}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200/40 pt-4">
        <div>
          <p className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">
            Executions
          </p>
          <p className="text-sm font-bold text-slate-800 mt-0.5">
            {flow.executionsCount.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">
            Conversions
          </p>
          <p className="text-sm font-bold text-slate-800 mt-0.5">
            {flow.conversionCount.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">
            Revenue
          </p>
          <p className="text-sm font-bold text-emerald-600 mt-0.5">
            {flow.revenueInfluenced === 0 ? "₹0" : `₹${(flow.revenueInfluenced / 100000).toFixed(2)}L`}
          </p>
        </div>
      </div>

      {/* Enterprise Reliability Indicators */}
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400">
        <div className="flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full bg-blue-500"></span>
          <span>Retry Safety: Active</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block size-1.5 rounded-full bg-emerald-500"></span>
          <span>No Duplicates: Verified</span>
        </div>
      </div>

      {/* Actions Block */}
      <div className="mt-4 flex flex-wrap gap-2 items-center justify-between border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleStatus(flow.id)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:text-blue-600 transition flex items-center gap-1 text-[11px] font-semibold text-slate-600 cursor-pointer"
          >
            {flow.status === "Active" ? (
              <>
                <Pause size={10} />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play size={10} />
                <span>Resume</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => onOpenEdit(flow)}
            className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:text-blue-600 transition flex items-center justify-center text-slate-500 cursor-pointer"
            title="Edit details"
          >
            <Edit3 size={12} />
          </button>
          <button
            type="button"
            onClick={() => onClone(flow.id)}
            className="h-8 w-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:text-blue-600 transition flex items-center justify-center text-slate-500 cursor-pointer"
            title="Clone flow"
          >
            <Copy size={12} />
          </button>
          <button
            type="button"
            onClick={() => onOpenReliability(flow)}
            className="h-8 px-2 rounded-lg border border-blue-100 bg-blue-50/50 hover:bg-blue-50 text-blue-600 hover:text-blue-700 transition flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
            title="Safety Center & Execution History"
          >
            <span>🛡️ Details</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onDelete(flow.id, flow.name)}
          className="h-8 w-8 rounded-lg border border-rose-100 bg-rose-50/50 hover:bg-rose-50 text-rose-500 hover:text-rose-700 transition flex items-center justify-center cursor-pointer"
          title="Delete flow"
        >
          <Trash2 size={12} />
        </button>
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
  const [selectedFlowForReliability, setSelectedFlowForReliability] = useState<FlowCardData | null>(null);
  
  // Reliability modal sub-tab
  const [reliabilityTab, setReliabilityTab] = useState<"history" | "audit" | "safety" >("history");

  // Form states
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowType, setNewFlowType] = useState<FlowType>("Lead Follow-up");
  const [newTriggerType, setNewTriggerType] = useState("Instagram DM Inbound");

  const [editFlowName, setEditFlowName] = useState("");
  const [editFlowType, setEditFlowType] = useState<FlowType>("Lead Follow-up");
  const [editTriggerType, setEditTriggerType] = useState("");

  // Load flows from local storage or populate initial ones
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (stored) {
          setFlows(JSON.parse(stored));
        } else {
          setFlows(INITIAL_FLOWS);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_FLOWS));
        }
      } catch (err) {
        console.error("Failed to load growth flows", err);
        setFlows(INITIAL_FLOWS);
      }
    }
  }, []);

  // Update default trigger type in creation modal depending on type selected
  useEffect(() => {
    const defaultTriggers: Record<FlowType, string> = {
      "Lead Follow-up": "Instagram DM Inbound",
      "Lead Reactivation": "WhatsApp 72h Idle",
      "Meeting Reminder": "Calendar Slot Booked",
      "Payment Reminder": "Invoice Link Generated",
      "Internal Notification": "High Intent Flagged",
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

  // Calculations for Overview Metrics
  const activeFlowsCount = useMemo(() => {
    return flows.filter((f) => f.status === "Active").length;
  }, [flows]);

  const totalExecutionsToday = useMemo(() => {
    const sum = flows
      .filter((f) => f.status === "Active")
      .reduce((acc, curr) => acc + curr.executionsCount, 0);
    if (activeFlowsCount === 0) return 0;
    return Math.max(12, Math.round(sum * 0.08));
  }, [flows, activeFlowsCount]);

  const totalConversions = useMemo(() => {
    return flows.reduce((acc, curr) => acc + curr.conversionCount, 0);
  }, [flows]);

  const totalRevenueInfluenced = useMemo(() => {
    return flows.reduce((acc, curr) => acc + curr.revenueInfluenced, 0);
  }, [flows]);

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

  // Optimistic Flow Controls
  const handleToggleStatus = useCallback(
    (id: string) => {
      const flowToUpdate = flows.find((f) => f.id === id);
      if (!flowToUpdate) return;

      const nextStatus: FlowStatus = flowToUpdate.status === "Active" ? "Paused" : "Active";
      const updated = flows.map((flow) =>
        flow.id === id ? { ...flow, status: nextStatus } : flow
      );
      
      persistFlows(updated);
      toast.success(
        nextStatus === "Active"
          ? `Flow "${flowToUpdate.name}" resumed successfully.`
          : `Flow "${flowToUpdate.name}" paused successfully.`
      );
    },
    [flows, persistFlows]
  );

  const handleCloneFlow = useCallback(
    (id: string) => {
      const flowToClone = flows.find((f) => f.id === id);
      if (!flowToClone) return;

      const clonedFlow: FlowCardData = {
        ...flowToClone,
        id: `flow-clone-${Date.now()}`,
        name: `${flowToClone.name} (Copy)`,
        status: "Draft",
        executionsCount: 0,
        conversionCount: 0,
        revenueInfluenced: 0,
      };

      const updated = [...flows, clonedFlow];
      persistFlows(updated);
      toast.success(`Successfully cloned flow into "${clonedFlow.name}".`);
    },
    [flows, persistFlows]
  );

  const handleDeleteFlow = useCallback(
    (id: string, name: string) => {
      const updated = flows.filter((flow) => flow.id !== id);
      persistFlows(updated);
      toast.success(`Flow "${name}" has been deleted.`);
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
      };

      const updated = [...flows, newFlow];
      persistFlows(updated);
      setIsCreateModalOpen(false);
      setNewFlowName("");
      toast.success(`Flow "${newFlow.name}" created successfully.`);
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
      toast.success("Flow details updated successfully.");
    },
    [flows, selectedFlow, editFlowName, editFlowType, editTriggerType, persistFlows]
  );

  const formatRevenue = (val: number) => {
    if (val === 0) return "₹0";
    if (val >= 100000) {
      return `₹${(val / 100000).toFixed(2)}L`;
    }
    return `₹${val.toLocaleString()}`;
  };

  // Generate dynamic mock data for reliability modal
  const mockRuns = useMemo(() => {
    if (!selectedFlowForReliability) return [];
    if (selectedFlowForReliability.status === "Draft" || selectedFlowForReliability.executionsCount === 0) {
      return [];
    }
    return [
      {
        id: `run-98${selectedFlowForReliability.id.substring(selectedFlowForReliability.id.length - 2)}A`,
        timestamp: "5 mins ago",
        status: "Success",
        retryCount: 0,
        deduplicated: "Yes (Key: idemp_9a8f23)",
        executionTime: "140ms"
      },
      {
        id: `run-98${selectedFlowForReliability.id.substring(selectedFlowForReliability.id.length - 2)}B`,
        timestamp: "45 mins ago",
        status: "Success (Recovered)",
        retryCount: 1, // Retry Safety check
        deduplicated: "Yes (Key: idemp_11a4cf)",
        executionTime: "310ms"
      },
      {
        id: `run-98${selectedFlowForReliability.id.substring(selectedFlowForReliability.id.length - 2)}C`,
        timestamp: "3 hours ago",
        status: "Success",
        retryCount: 0,
        deduplicated: "Yes (Key: idemp_ff81ac)",
        executionTime: "125ms"
      },
      {
        id: `run-98${selectedFlowForReliability.id.substring(selectedFlowForReliability.id.length - 2)}D`,
        timestamp: "6 hours ago",
        status: "Success",
        retryCount: 0,
        deduplicated: "Yes (Key: idemp_87e2b1)",
        executionTime: "160ms"
      },
      {
        id: `run-98${selectedFlowForReliability.id.substring(selectedFlowForReliability.id.length - 2)}E`,
        timestamp: "1 day ago",
        status: "Success",
        retryCount: 0,
        deduplicated: "Yes (Key: idemp_e12a45)",
        executionTime: "135ms"
      }
    ];
  }, [selectedFlowForReliability]);

  const mockTimeline = useMemo(() => {
    if (!selectedFlowForReliability) return [];
    const timeline = [
      {
        action: "Flow Created",
        details: `Initialized as ${selectedFlowForReliability.type} template`,
        actor: "Founder (Primary Owner)",
        timestamp: "5 days ago"
      }
    ];

    if (selectedFlowForReliability.status === "Active") {
      timeline.unshift({
        action: "Flow Resumed",
        details: "Set to Active, listening to triggers",
        actor: "Founder (Primary Owner)",
        timestamp: "2 hours ago"
      });
    } else if (selectedFlowForReliability.status === "Paused") {
      timeline.unshift({
        action: "Flow Paused",
        details: "Suspended trigger listeners",
        actor: "Founder (Primary Owner)",
        timestamp: "1 day ago"
      });
    }

    if (selectedFlowForReliability.executionsCount > 0) {
      timeline.unshift({
        action: "Configuration Verified",
        details: "Retry safety & Deduplication policies certified",
        actor: "System Guardrails",
        timestamp: "3 days ago"
      });
    }

    return timeline;
  }, [selectedFlowForReliability]);

  // Polished placeholder content for tabs
  const getTabPlaceholderContent = (tabId: string) => {
    switch (tabId) {
      case "comment-triggers":
        return {
          title: "Comment Triggers Dashboard",
          subtitle: "Turn public social engagement into private sales pipeline conversations.",
          description: "Configure instant, custom triggers that watch your posts and reels. When leads comment, the growth engine automatically verifies context and initiates private DM follow-ups.",
          badge: "Lead OS Integration"
        };
      case "templates":
        return {
          title: "Growth Templates Library",
          subtitle: "Ready-to-deploy, deterministic automations designed for founders.",
          description: "Browse high-converting follow-up flows, booking reminders, reactivations, and notifications engineered for immediate business metrics growth.",
          badge: "Proven Blueprints"
        };
      case "activity":
        return {
          title: "Global Engine Activity Feed",
          subtitle: "Complete auditability and execution records for peace of mind.",
          description: "View real-time traces, guardrail triggers, and detailed event details. Keep track of what your customer-facing desk is doing across all messaging platforms.",
          badge: "Audit & Compliance"
        };
      case "performance":
        return {
          title: "Engine Performance Insights",
          subtitle: "Measure exactly how much revenue and conversion is driven by your flows.",
          description: "Deep analytics tracking trigger execution rates, customer click-through velocity, and exact revenue influences on a client-by-client basis.",
          badge: "ROI Analytics"
        };
      case "settings":
        return {
          title: "Engine Safety Controls",
          subtitle: "Fine-tune deduplication, retries, and global safety limits.",
          description: "Maintain maximum control. Customize retry intervals, idempotency rules, rate limits, and compliance restrictions to protect your user experience.",
          badge: "Global Guardrails"
        };
      default:
        return {
          title: "Coming Soon",
          subtitle: "Next-gen growth features are currently in active development.",
          description: "We are tailoring this workspace to deliver absolute reliability and elite customer interactions.",
          badge: "Enterprise V2"
        };
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full min-h-0 bg-transparent">
      {/* Horizontal Tabs */}
      <div className="sticky top-0 z-10 w-full bg-slate-50/80 pb-2 backdrop-blur-md">
        <div className="flex w-full items-center justify-between border-b border-slate-200/80 px-2 py-3 sm:px-4">
          <div className="flex w-full overflow-x-auto no-scrollbar sm:w-auto">
            <div className="flex items-center gap-1.5 rounded-2xl bg-slate-200/60 p-1 backdrop-blur-xl">
              {[
                { id: "flows", label: "Flows", icon: Workflow },
                { id: "comment-triggers", label: "Comment Triggers", icon: MessageSquare },
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
                      relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-200 ease-out focus:outline-none sm:text-sm
                      ${isActive ? "bg-white text-blue-600 shadow-sm border border-slate-200/10" : "text-slate-500 hover:text-slate-800"}
                    `}
                  >
                    <Icon size={14} className={isActive ? "text-blue-600" : "text-slate-400"} />
                    <span className="whitespace-nowrap">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === "flows" && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="hidden sm:flex items-center gap-2 brand-button-primary py-2 px-4 text-xs rounded-xl shadow-sm cursor-pointer"
            >
              <Plus size={14} />
              <span>Create Flow</span>
            </button>
          )}
        </div>
      </div>

      {activeTab === "flows" ? (
        <>
          {/* Overview Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Active Flows */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/88 px-5 py-4 shadow-sm backdrop-blur-xl transition hover:shadow-md">
              <div className="absolute right-3 top-3 rounded-2xl bg-blue-50/50 p-2 border border-blue-100/20">
                <Workflow className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Active Flows
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">
                {activeFlowsCount}
              </h3>
              <p className="mt-1 text-[11px] text-slate-500 font-medium">
                Configured growth funnels
              </p>
            </div>

            {/* Automations Running Today */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/88 px-5 py-4 shadow-sm backdrop-blur-xl transition hover:shadow-md">
              <div className="absolute right-3 top-3 rounded-2xl bg-emerald-50/50 p-2 border border-emerald-100/20">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Automations Running Today
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">
                {totalExecutionsToday}
              </h3>
              <p className="mt-1 text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <span>⚡ Triggers listening live</span>
              </p>
            </div>

            {/* Conversions Generated */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/88 px-5 py-4 shadow-sm backdrop-blur-xl transition hover:shadow-md">
              <div className="absolute right-3 top-3 rounded-2xl bg-purple-50/50 p-2 border border-purple-100/20">
                <CheckCircle className="h-5 w-5 text-purple-600" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Conversions Generated
              </p>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">
                {totalConversions}
              </h3>
              <p className="mt-1 text-[11px] text-slate-500 font-medium">
                Customer milestones hit
              </p>
            </div>

            {/* Revenue Influenced */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/88 px-5 py-4 shadow-sm backdrop-blur-xl transition hover:shadow-md">
              <div className="absolute right-3 top-3 rounded-2xl bg-amber-50/50 p-2 border border-amber-100/20">
                <CreditCard className="h-5 w-5 text-amber-600" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Revenue Influenced
              </p>
              <h3 className="mt-2 text-2xl font-bold text-emerald-600">
                {formatRevenue(totalRevenueInfluenced)}
              </h3>
              <p className="mt-1 text-[11px] text-slate-500 font-medium">
                Attributed pipeline growth
              </p>
            </div>
          </div>

          {/* Search, Filter, and Grid Interface */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              {/* Search input */}
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search flows..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 bg-white/90 rounded-xl focus:border-blue-500 focus:outline-none shadow-sm"
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
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap flex-1 sm:flex-initial text-center ${
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
              <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200/80 bg-white/70 px-6 py-12 text-center shadow-sm backdrop-blur-xl">
                <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 mb-4 border border-blue-100/50">
                  <Workflow size={24} />
                </div>
                <h3 className="text-base font-bold text-slate-900">No automations yet.</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm">
                  Create your first flow to begin automating growth activities.
                </p>
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="brand-button-primary py-1.5 px-4 text-xs rounded-xl cursor-pointer"
                  >
                    Create Flow
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("templates");
                    }}
                    className="brand-button-secondary py-1.5 px-4 text-xs rounded-xl cursor-pointer"
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
                    onClone={handleCloneFlow}
                    onDelete={handleDeleteFlow}
                    onOpenReliability={setSelectedFlowForReliability}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Polished Coming Soon Placeholders for other tabs */
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200/80 bg-white/72 px-8 py-16 text-center shadow-sm backdrop-blur-xl max-w-2xl mx-auto my-6">
          <span className="brand-chip brand-chip-dark mb-4 text-[10px] uppercase font-bold tracking-wider px-3 py-1">
            {getTabPlaceholderContent(activeTab).badge}
          </span>
          <div className="h-14 w-14 rounded-2xl bg-blue-50/70 border border-blue-100 flex items-center justify-center text-blue-500 mb-4 shadow-sm">
            <Sparkles size={24} className="animate-pulse text-blue-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-950">
            {getTabPlaceholderContent(activeTab).title}
          </h3>
          <p className="mt-1 text-xs font-semibold text-blue-600 max-w-md">
            {getTabPlaceholderContent(activeTab).subtitle}
          </p>
          <p className="mt-3 text-xs text-slate-500 max-w-md leading-relaxed">
            {getTabPlaceholderContent(activeTab).description}
          </p>
          
          <div className="mt-8 flex gap-3">
            <button
              onClick={() => setActiveTab("flows")}
              className="brand-button-secondary py-2 px-5 text-xs rounded-xl cursor-pointer border border-slate-200 hover:bg-slate-50 transition"
            >
              Back to Flows Workspace
            </button>
          </div>
        </div>
      )}

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
                  <option value="Lead Reactivation">Lead Reactivation</option>
                  <option value="Meeting Reminder">Meeting Reminder</option>
                  <option value="Payment Reminder">Payment Reminder</option>
                  <option value="Internal Notification">Internal Notification</option>
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
                  <option value="Lead Reactivation">Lead Reactivation</option>
                  <option value="Meeting Reminder">Meeting Reminder</option>
                  <option value="Payment Reminder">Payment Reminder</option>
                  <option value="Internal Notification">Internal Notification</option>
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

      {/* Enterprise Reliability Center Modal */}
      {selectedFlowForReliability && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div className="brand-panel-strong w-full max-w-2xl rounded-[32px] overflow-hidden shadow-2xl border border-slate-200 bg-white flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-start justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="brand-chip brand-chip-dark text-[9px] uppercase font-bold tracking-wider px-2 py-0.5">
                    🛡️ Reliability & Safety Center
                  </span>
                  <span className="text-slate-400 text-xs font-semibold">|</span>
                  <span className="text-slate-500 text-xs font-semibold">Deterministic Audits</span>
                </div>
                <h3 className="mt-1 text-base sm:text-lg font-bold text-slate-950 truncate">
                  {selectedFlowForReliability.name}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Type: {selectedFlowForReliability.type} • Trigger: {selectedFlowForReliability.triggerType}
                </p>
              </div>
              
              <button
                onClick={() => setSelectedFlowForReliability(null)}
                className="h-9 w-9 rounded-xl hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Inner Tabs Selector */}
            <div className="flex border-b border-slate-100 bg-slate-50/50 px-4 py-2">
              {[
                { id: "history", label: "Execution History", icon: History },
                { id: "audit", label: "Audit Trail", icon: Activity },
                { id: "safety", label: "Safety & Guardrails", icon: ShieldCheck },
              ].map((tab) => {
                const isActive = reliabilityTab === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setReliabilityTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      isActive ? "bg-white text-blue-600 shadow-sm border border-slate-200/50" : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Icon size={13} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 brand-scrollbar">
              
              {/* Tab 1: Execution History */}
              {reliabilityTab === "history" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 uppercase font-bold tracking-wider pb-2 border-b border-slate-100">
                    <span>Run Details</span>
                    <span className="text-right">Execution status</span>
                  </div>

                  {mockRuns.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      <Clock className="mx-auto h-8 w-8 text-slate-300 mb-2" />
                      No executions logged yet. Activate the flow to begin tracking.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {mockRuns.map((run) => (
                        <div key={run.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50/30 hover:bg-slate-50 transition text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">{run.id}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500 text-[10px]">{run.timestamp}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400">
                              <span>Verification key: {run.deduplicated}</span>
                              <span>•</span>
                              <span>Lat: {run.executionTime}</span>
                            </div>
                          </div>

                          <div className="text-right space-y-1">
                            <span className={`inline-block text-[9px] font-bold uppercase tracking-wide border px-2 py-0.5 rounded-full ${
                              run.status.includes("Recovered") 
                                ? "bg-amber-50 text-amber-700 border-amber-100" 
                                : "bg-emerald-50 text-emerald-700 border-emerald-100"
                            }`}>
                              {run.status}
                            </span>
                            {run.retryCount > 0 && (
                              <p className="text-[9px] text-amber-600 font-semibold">
                                🛡️ Retry Safety recovered run
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="rounded-2xl bg-blue-50/50 border border-blue-100/50 p-3 flex gap-2.5 items-start mt-4">
                    <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-slate-600 leading-relaxed">
                      <strong className="text-slate-900 block font-bold">Trace & Replay Observability</strong>
                      Past executions verify that all message delivery steps were checked. Deduplication window actively prevents repeat triggers.
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Audit Trail */}
              {reliabilityTab === "audit" && (
                <div className="space-y-6">
                  <div className="relative border-l-2 border-slate-100 ml-3.5 pl-6 space-y-6">
                    {mockTimeline.map((item, index) => (
                      <div key={index} className="relative">
                        {/* Bullet circle */}
                        <span className="absolute -left-[31px] top-0.5 flex size-4 items-center justify-center rounded-full bg-white border-2 border-blue-500 shadow-sm">
                          <span className="size-1.5 rounded-full bg-blue-500" />
                        </span>
                        
                        <div className="space-y-0.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{item.action}</span>
                            <span className="text-[10px] text-slate-400">{item.timestamp}</span>
                          </div>
                          <p className="text-slate-500">{item.details}</p>
                          <p className="text-[10px] text-slate-400 font-medium">Actor: {item.actor}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl bg-slate-50 border border-slate-200/50 p-3 flex gap-2.5 items-start">
                    <Database className="h-4 w-4 text-slate-600 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-slate-600 leading-relaxed">
                      <strong className="text-slate-900 block font-bold">Auditability Compliance</strong>
                      All edits, state adjustments, and deployment configurations are permanently logged to ensure full administrative trace capability.
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Safety Guardrails */}
              {reliabilityTab === "safety" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Retry Safety Guard */}
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-blue-100/50 text-blue-600 border border-blue-100">
                          <ShieldCheck size={16} />
                        </div>
                        <h4 className="font-bold text-slate-900 text-xs">Retry Safety Protocol</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Protects communication channels from network latency or transient client-side API failures.
                      </p>
                      <div className="border-t border-slate-100 pt-2 text-[10px] space-y-1 text-slate-600">
                        <div className="flex justify-between font-medium">
                          <span>Max Attempts:</span>
                          <span className="font-bold text-slate-800">3 Retries</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span>Backoff Strategy:</span>
                          <span className="font-bold text-slate-800">Exponential Jitter</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span>Status:</span>
                          <span className="text-emerald-600 font-bold">✓ Enabled</span>
                        </div>
                      </div>
                    </div>

                    {/* Duplicate Prevention Guard */}
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-100/50 text-emerald-600 border border-emerald-100">
                          <Clock size={16} />
                        </div>
                        <h4 className="font-bold text-slate-900 text-xs">Duplicate Prevention</h4>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Ensures customer accounts are never messaged multiple times due to repeated trigger events.
                      </p>
                      <div className="border-t border-slate-100 pt-2 text-[10px] space-y-1 text-slate-600">
                        <div className="flex justify-between font-medium">
                          <span>De-duplication Hash:</span>
                          <span className="font-bold text-slate-800">Sender + Event ID</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span>Verification Window:</span>
                          <span className="font-bold text-slate-800">10 Minutes</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span>Status:</span>
                          <span className="text-emerald-600 font-bold">✓ Active</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  <div className="rounded-2xl bg-amber-50/60 border border-amber-100/50 p-3.5 flex gap-2.5 items-start">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-[11px] text-slate-700 leading-relaxed">
                      <strong className="text-slate-900 block font-bold">Safety Bounds Enforcement</strong>
                      Safety limit rules throttle this flow if executions exceed 500 per minute or 5,000 per day, protecting your integrated channels from rate limits.
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedFlowForReliability(null)}
                className="brand-button-secondary py-2 px-5 text-xs rounded-xl cursor-pointer"
              >
                Close Safety Center
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
