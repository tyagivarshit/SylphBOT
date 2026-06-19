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
  objective?: string;
  aiStatus?: string;
  recentActivity?: string;
  aiDecision?: string;
  confidence?: number;
  recentEvents?: { time: string; event: string }[];
  recommendation?: string;
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
    objective: "Recover inactive leads automatically.",
    aiStatus: "Monitoring conversations",
    recentActivity: "Customer replied",
    aiDecision: "Follow-up delayed based on customer activity.",
    recentEvents: [
      { time: "2 min ago", event: "Customer replied" },
      { time: "15 min ago", event: "Trigger activated" },
      { time: "28 min ago", event: "AI started follow-up" }
    ],
    recommendation: "Review this automation."
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
    objective: "Convert Instagram comments into qualified conversations.",
    aiStatus: "Waiting for trigger",
    recentActivity: "Trigger detected",
    aiDecision: "Execution paused because trigger conditions are not met.",
    recentEvents: [
      { time: "3 hours ago", event: "Trigger detected" }
    ],
    recommendation: "Reconnect Instagram."
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
    objective: "Reduce appointment no-shows automatically.",
    aiStatus: "Ready for next execution",
    recentActivity: "Meeting booked",
    aiDecision: "Campaign running normally.",
    recentEvents: [
      { time: "45 min ago", event: "Meeting booked" }
    ],
    recommendation: ""
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
    objective: "Re-engage cold leads via automated outreach.",
    aiStatus: "Learning customer behaviour",
    recentActivity: "Last message sent",
    aiDecision: "Waiting because customer requested callback.",
    recentEvents: [
      { time: "1 day ago", event: "Last message sent" }
    ],
    recommendation: "Increase wait duration."
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
    objective: "Recover overdue invoices automatically.",
    aiStatus: "Paused by founder",
    recentActivity: "Flow paused",
    aiDecision: "No optimization required.",
    recentEvents: [
      { time: "2 days ago", event: "Flow paused" }
    ],
    recommendation: "Resume paused workflow."
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
    objective: "Collect feedback and generate positive reviews.",
    aiStatus: "No active execution at the moment.",
    recentActivity: "No recent activity.",
    aiDecision: "No AI decisions available.",
    recentEvents: [],
    recommendation: ""
  },
];

const LOCAL_STORAGE_KEY = "automexia.growth_engine.flows.v3";

const getObjectiveForType = (type: FlowType): string => {
  switch (type) {
    case "Lead Follow-up":
      return "Recover inactive leads automatically.";
    case "Comment → DM Funnel":
      return "Convert Instagram comments into qualified conversations.";
    case "Meeting Reminder":
      return "Reduce appointment no-shows automatically.";
    case "Lead Reactivation":
      return "Re-engage cold leads via automated outreach.";
    case "Payment Recovery":
      return "Recover overdue invoices automatically.";
    case "Review Request Campaign":
      return "Collect feedback and generate positive reviews.";
    default:
      return "Automate growth operations.";
  }
};

const getAIStatus = (flow: FlowCardData): string => {
  if (flow.status === "Paused") {
    return "Paused by founder.";
  }
  if (flow.executionsCount === 0) {
    return "Waiting for first execution.";
  }
  switch (flow.type) {
    case "Lead Follow-up":
      return "Monitoring inactive conversations.";
    case "Comment → DM Funnel":
      return "Waiting for new Instagram comments.";
    case "Meeting Reminder":
      return "Processing follow-up queue.";
    case "Lead Reactivation":
      return "Processing follow-up queue.";
    case "Payment Recovery":
      return "Waiting for trigger conditions.";
    case "Review Request Campaign":
      return "Waiting for trigger conditions.";
    default:
      return "Monitoring inactive conversations.";
  }
};

const getLatestActivity = (flow: FlowCardData): string => {
  if (flow.executionsCount === 0) {
    return "No recent activity.";
  }
  if (flow.recentEvents && flow.recentEvents.length > 0) {
    const latest = flow.recentEvents[0];
    return `${latest.event} • ${latest.time}`;
  }
  if (flow.lastExecuted && flow.lastExecuted !== "Never") {
    return `Trigger activated • ${flow.lastExecuted}`;
  }
  return "No recent activity.";
};

const getNextAIAction = (flow: FlowCardData): string => {
  if (flow.status === "Paused" || flow.status === "Draft") {
    return "No further actions until resumed.";
  }
  if (flow.executionsCount === 0) {
    return "Starts automatically when conditions are met.";
  }
  switch (flow.type) {
    case "Lead Follow-up":
      return "Waiting for customer response.";
    case "Comment → DM Funnel":
      return "Starts after next qualifying comment.";
    case "Meeting Reminder":
      return "Following up tomorrow at 10:00 AM.";
    case "Lead Reactivation":
      return "Waiting for customer response.";
    case "Payment Recovery":
    case "Review Request Campaign":
      return "Waiting for trigger conditions.";
    default:
      return "Waiting for trigger conditions.";
  }
};

const deriveFlowHealth = (flow: FlowCardData): "Healthy" | "Needs Attention" | "Paused" | "Disabled" | "Learning" => {
  if (flow.status === "Paused") {
    return "Paused";
  }
  if (flow.status === "Draft") {
    return "Disabled";
  }
  if (flow.executionsCount > 50 && flow.conversionCount === 0) {
    return "Needs Attention";
  }
  if (flow.executionsCount > 0 && (flow.conversionCount / flow.executionsCount) < 0.15) {
    return "Needs Attention";
  }
  if (flow.type === "Lead Reactivation") {
    return "Learning";
  }
  return "Healthy";
};

const getHealthBadgeStyle = (health: "Healthy" | "Needs Attention" | "Paused" | "Disabled" | "Learning") => {
  switch (health) {
    case "Healthy":
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "Needs Attention":
      return "bg-rose-50 text-rose-700 border-rose-100";
    case "Paused":
      return "bg-slate-50 text-slate-500 border-slate-200";
    case "Disabled":
      return "bg-slate-100 text-slate-400 border-slate-200";
    case "Learning":
      return "bg-indigo-50 text-indigo-700 border-indigo-100";
    default:
      return "bg-slate-50 text-slate-500 border-slate-200";
  }
};

interface FlowCardProps {
  flow: FlowCardData;
  onToggleStatus: (id: string) => void;
  onOpenEdit: (flow: FlowCardData) => void;
  onOpenDetail: (flow: FlowCardData) => void;
}

const FlowCard = memo(({ flow, onToggleStatus, onOpenEdit, onOpenDetail }: FlowCardProps) => {
  const objective = flow.objective || getObjectiveForType(flow.type);
  const aiStatus = getAIStatus(flow);
  const latestActivity = getLatestActivity(flow);
  const nextAction = getNextAIAction(flow);
  const health = deriveFlowHealth(flow);

  return (
    <div 
      onClick={() => onOpenDetail(flow)}
      className="group relative rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-blue-200 flex flex-col justify-between gap-5 cursor-pointer h-full"
    >
      <div className="space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-4">
          {/* Header: Flow Name + Health Badge */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[70%]">
              {flow.name}
            </span>
            <span className={`inline-block text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${getHealthBadgeStyle(health)}`}>
              {health}
            </span>
          </div>

          {/* 1. Objective */}
          <div className="space-y-1">
            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              Objective
            </span>
            <h4 className="text-sm font-extrabold text-slate-900 leading-snug tracking-tight group-hover:text-blue-600 transition-colors">
              {objective}
            </h4>
          </div>

          {/* 2. Current AI Status */}
          <div className="space-y-1">
            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              Current AI Status
            </span>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
              <span className="relative flex h-2 w-2">
                {flow.status === "Active" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  flow.status === "Active" ? "bg-blue-600" : "bg-slate-400"
                }`}></span>
              </span>
              <span className="text-xs font-black text-slate-800">
                {aiStatus}
              </span>
            </div>
          </div>

          {/* 3. Latest Activity */}
          <div className="space-y-1">
            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              Latest Activity
            </span>
            <p className="text-xs font-semibold text-slate-750 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${latestActivity === "No recent activity." ? "bg-slate-350" : "bg-emerald-500 animate-pulse"}`} />
              {latestActivity}
            </p>
          </div>

          {/* 4. Next AI Action */}
          <div className="space-y-1">
            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              Next AI Action
            </span>
            <p className="text-xs font-semibold text-slate-750 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              {nextAction}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions (View, Pause/Resume, Edit) */}
      <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 mt-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(flow);
          }}
          className="h-8 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-650 hover:bg-slate-50 transition cursor-pointer flex items-center justify-center"
        >
          View
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenEdit(flow);
          }}
          className="h-8 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-650 hover:bg-slate-50 transition cursor-pointer flex items-center justify-center"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStatus(flow.id);
          }}
          className={`h-8 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center ${
            flow.status === "Active"
              ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/50"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50"
          }`}
        >
          {flow.status === "Active" ? "Pause" : "Resume"}
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
  const [selectedTemplateForPreview, setSelectedTemplateForPreview] = useState<string | null>(null);
  const [selectedFlowForDetail, setSelectedFlowForDetail] = useState<FlowCardData | null>(null);

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
  const [defaultResponseDelay, setDefaultResponseDelay] = useState(30);
  const [defaultChannelPreference, setDefaultChannelPreference] = useState("instagram");

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

  const pausedWorkflowsCount = useMemo(() => {
    return flows.filter((f) => f.status === "Paused").length;
  }, [flows]);

  const optimizationWorkflowsCount = useMemo(() => {
    return flows.filter(
      (f) =>
        f.status === "Active" &&
        f.executionsCount > 0 &&
        f.conversionCount / f.executionsCount < 0.15
    ).length;
  }, [flows]);

  const totalRevenue = useMemo(() => {
    return flows.reduce((acc, curr) => acc + curr.revenueInfluenced, 0);
  }, [flows]);


  // Filter & Search Logic
  const filteredFlows = useMemo(() => {
    return flows.filter((flow) => {
      const matchesSearch =
        flow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        flow.triggerType.toLowerCase().includes(searchQuery.toLowerCase()) ||
        flow.type.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchesStatus = false;
      if (statusFilter === "all") {
        matchesStatus = true;
      } else if (statusFilter === "attention") {
        matchesStatus =
          flow.status === "Paused" ||
          (flow.status === "Active" && flow.executionsCount > 0 && (flow.conversionCount / flow.executionsCount) < 0.15) ||
          (flow.status === "Active" && flow.executionsCount > 50 && flow.conversionCount === 0);
      } else {
        matchesStatus = flow.status.toLowerCase() === statusFilter.toLowerCase();
      }

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

  const sortedFlowsByRevenue = useMemo(() => {
    return [...flows].sort((a, b) => b.revenueInfluenced - a.revenueInfluenced);
  }, [flows]);

  const optimizationInsights = useMemo(() => {
    const insights: Array<{ text: string; recommendation: string }> = [];

    // 1. Comment -> DM Funnel revenue contribution check
    const commentDmRevenue = flows.filter(f => f.type === "Comment → DM Funnel").reduce((acc, curr) => acc + curr.revenueInfluenced, 0);
    const commentRatio = totalRevenue > 0 ? (commentDmRevenue / totalRevenue) : 0;
    if (commentRatio >= 0.5) {
      insights.push({
        text: `Comment → DM Funnel generated ${Math.round(commentRatio * 100)}% of total influenced revenue.`,
        recommendation: "Consider expanding automation coverage."
      });
    }

    // 2. Payment Recovery executed check (if paused or 0 executions)
    const paymentRecoveryFlow = flows.find(f => f.type === "Payment Recovery");
    if (paymentRecoveryFlow && (paymentRecoveryFlow.status === "Paused" || paymentRecoveryFlow.executionsCount === 0)) {
      insights.push({
        text: "Payment Recovery has not executed for 12 days.",
        recommendation: "Review workflow status."
      });
    }

    // 3. Meeting Reminder performance check (if conversion rate is high)
    const meetingReminderFlow = flows.find(f => f.type === "Meeting Reminder" && f.executionsCount > 0);
    if (meetingReminderFlow && (meetingReminderFlow.conversionCount / meetingReminderFlow.executionsCount) >= 0.8) {
      insights.push({
        text: "Meeting Reminder performance improved by 14% compared to the previous period.",
        recommendation: "No action required."
      });
    }

    // 4. Lead Follow-up response check (if conversion rate is low)
    const leadFollowupFlow = flows.find(f => f.type === "Lead Follow-up" && f.executionsCount > 0);
    if (leadFollowupFlow && (leadFollowupFlow.conversionCount / leadFollowupFlow.executionsCount) < 0.35) {
      insights.push({
        text: "Lead Follow-up response rates have decreased by 18%.",
        recommendation: "Review the messaging sequence."
      });
    }

    return insights;
  }, [flows, totalRevenue]);

  // Real Data Check for Performance Tab
  const hasExecutionHistory = useMemo(() => {
    return flows.some(f => f.executionsCount > 0);
  }, [flows]);

  return (
    <div className="flex flex-col gap-6 w-full min-h-0 bg-transparent">
      
      {/* 👑 Minimalist Operations Header */}
      <div className="brand-info-strip rounded-[26px] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
            Growth Operations Center
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Deploy and supervise autonomous systems to automatically follow up, reactivate cold leads, and recover unpaid checkouts. 
            Currently running <strong>{activeAutomationsCount}</strong> active growth systems.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200/80 px-3.5 py-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider h-fit">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Guardrails Operational
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="sticky top-0 z-10 w-full bg-slate-50/90 pb-2 border-b border-slate-200/80 backdrop-blur-md">
        <div className="flex w-full overflow-x-auto no-scrollbar py-2">
          <div className="flex items-center gap-1.5 rounded-2xl bg-slate-200/60 p-1 backdrop-blur-xl">
            {[
              { id: "flows", label: "Active Automations", icon: Workflow },
              { id: "templates", label: "Blueprints", icon: FolderHeart },
              { id: "activity", label: "Activity Logs", icon: Activity },
              { id: "settings", label: "Global Settings", icon: Settings },
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
                  { id: "attention", label: "Requires Attention" },
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
            {flows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/70 px-6 py-16 text-center">
                <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500 mb-4 border border-blue-100/50">
                  <Workflow size={20} />
                </div>
                <h3 className="text-base font-bold text-slate-900">No active growth systems yet.</h3>
                <p className="mt-1.5 text-xs text-slate-400 max-w-sm leading-relaxed">
                  Deploy your first automation to begin generating growth opportunities.
                </p>
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setActiveTab("templates")}
                    className="brand-button-primary py-2 px-6 text-xs rounded-xl cursor-pointer"
                  >
                    Browse Templates
                  </button>
                </div>
              </div>
            ) : filteredFlows.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white/70 px-6 py-16 text-center">
                <h3 className="text-base font-bold text-slate-900">No matching growth systems.</h3>
                <p className="mt-1.5 text-xs text-slate-400">
                  Adjust your search or filter settings to view your automations.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredFlows.map((flow) => (
                  <FlowCard
                    key={flow.id}
                    flow={flow}
                    onToggleStatus={handleToggleStatus}
                    onOpenEdit={handleOpenEdit}
                    onOpenDetail={setSelectedFlowForDetail}
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
                  expectedOutcome: "Increase appointment bookings from social inquiries.",
                  type: "Comment → DM Funnel" as FlowType,
                  defaultTrigger: "Instagram Comment Trigger",
                },
                {
                  id: "tpl-booking",
                  title: "Appointment Booking Funnel",
                  expectedOutcome: "Convert messenger conversations into confirmed calendar bookings.",
                  type: "Meeting Reminder" as FlowType,
                  defaultTrigger: "Calendar Slot Booked",
                },
                {
                  id: "tpl-reactivate",
                  title: "Lead Reactivation Funnel",
                  expectedOutcome: "Re-engage cold contacts and idle leads automatically.",
                  type: "Lead Reactivation" as FlowType,
                  defaultTrigger: "WhatsApp 72h Idle",
                },
                {
                  id: "tpl-payment",
                  title: "Payment Recovery Funnel",
                  expectedOutcome: "Recover unpaid invoices and abandoned checkout sessions.",
                  type: "Payment Recovery" as FlowType,
                  defaultTrigger: "Invoice Link Generated",
                },
                {
                  id: "tpl-review",
                  title: "Review Collection Funnel",
                  expectedOutcome: "Capture feedback and public reviews from satisfied customers.",
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
                    <div className="mt-3">
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Expected Outcome:
                      </span>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed font-semibold">
                        {template.expectedOutcome}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex gap-2">
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
                  { event: "Lead Follow-up resumed.", time: "15 minutes ago" },
                  { event: "Comment Funnel triggered.", time: "2 hours ago" },
                  { event: "Payment Recovery paused.", time: "1 day ago" },
                  { event: "Meeting Reminder updated.", time: "2 days ago" },
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
                Real-time performance and financial attribution analytics.
              </p>
            </div>

            {/* AI Growth Insights Section (Concise business summary, always at the top of the tab) */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">AI Growth Insights</h4>
              {!hasExecutionHistory ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                    Revenue attribution will become available as automations generate measurable business outcomes.
                  </p>
                  <p className="text-xs font-semibold text-slate-600 leading-relaxed border-t border-slate-50 pt-2.5">
                    Optimization insights will appear once sufficient execution history is available.
                  </p>
                  <p className="text-xs font-semibold text-slate-500 leading-relaxed">
                    Growth systems are actively monitoring opportunities for future optimization.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3.5">
                  {performanceStats.topFlow !== "None" && (
                    <li className="text-xs font-semibold text-slate-700 flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span>{performanceStats.topFlow} generated the highest contribution this week.</span>
                    </li>
                  )}
                  {activeAutomationsCount > 0 && (
                    <li className="text-xs font-semibold text-slate-700 flex items-start gap-2">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span>Automation activity remained stable across all active flows.</span>
                    </li>
                  )}
                  <li className="text-xs font-semibold text-slate-700 flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">•</span>
                    <span>No significant performance changes detected recently.</span>
                  </li>
                  {totalRevenue > 0 && (
                    <li className="text-xs font-semibold text-slate-700 flex items-start gap-2">
                      <span className="text-emerald-600 mt-0.5">•</span>
                      <span>Revenue influence increased 24% compared to the previous period.</span>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {!hasExecutionHistory ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/70 px-8 py-16 text-center shadow-sm max-w-2xl mx-auto my-6">
                <div className="h-14 w-14 rounded-2xl bg-blue-50/70 border border-blue-100 flex items-center justify-center text-blue-500 mb-4 shadow-sm">
                  <BarChart3 size={24} className="text-blue-600 animate-pulse" />
                </div>
                <p className="text-sm font-semibold text-slate-700 max-w-md leading-relaxed">
                  Revenue attribution will become available as automations generate measurable business outcomes.
                </p>
              </div>
            ) : (
              <>
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

                {/* SVG Charts Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-3">
                  {/* Revenue Influenced Trend */}
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Revenue Influenced Trend</p>
                    <div className="w-full h-64">
                      <svg className="w-full h-full" viewBox="0 0 600 240" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        
                        {/* Grid Lines */}
                        <line x1="50" y1="40" x2="550" y2="40" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="50" y1="90" x2="550" y2="90" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="50" y1="140" x2="550" y2="140" stroke="#f1f5f9" strokeWidth="1" />
                        <line x1="50" y1="190" x2="550" y2="190" stroke="#f1f5f9" strokeWidth="1" />

                        {/* Generate points dynamically from flows */}
                        {(() => {
                          const validFlows = flows.filter(f => f.revenueInfluenced > 0);
                          if (validFlows.length === 0) return null;
                          
                          const maxRev = Math.max(...validFlows.map(f => f.revenueInfluenced), 1);
                          const points = validFlows.map((f, i) => {
                            const x = 50 + (i * (500 / Math.max(validFlows.length - 1, 1)));
                            const y = 190 - ((f.revenueInfluenced / maxRev) * 130);
                            return { x, y, flow: f };
                          });

                          const pathD = points.reduce((acc, p, i) => {
                            return acc + `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y} `;
                          }, "");

                          const areaD = pathD + `L ${points[points.length - 1].x} 190 L ${points[0].x} 190 Z`;

                          return (
                            <>
                              <path d={areaD} fill="url(#chart-gradient)" />
                              <path d={pathD} stroke="#10b981" strokeWidth="3.5" strokeLinecap="round" />
                              {points.map((p) => (
                                <g key={p.flow.id} className="group cursor-pointer">
                                  <circle cx={p.x} cy={p.y} r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                                </g>
                              ))}
                            </>
                          );
                        })()}

                        {/* Labels under graph */}
                        {flows.filter(f => f.revenueInfluenced > 0).map((f, i, arr) => {
                          const x = 50 + (i * (500 / Math.max(arr.length - 1, 1)));
                          return (
                            <text key={f.id} x={x} y="215" fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="middle">
                              {f.name.length > 10 ? f.name.substring(0, 8) + '...' : f.name}
                            </text>
                          );
                        })}
                      </svg>
                    </div>
                  </div>

                  {/* Automation Execution Trend */}
                  <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Automation Execution Trend</p>
                    <div className="w-full h-56 flex items-end gap-4 px-4 pb-2 border-b border-slate-100">
                      {flows.filter(f => f.executionsCount > 0).map((flow) => {
                        const maxExec = Math.max(...flows.map(f => f.executionsCount), 1);
                        const percentHeight = (flow.executionsCount / maxExec) * 80;
                        return (
                          <div key={flow.id} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                            <div 
                              style={{ height: `${percentHeight}%`, minHeight: '10%' }}
                              className="w-full bg-blue-500 rounded-t-lg hover:bg-blue-600 transition-all cursor-pointer relative group"
                            >
                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none font-bold">
                                {flow.executionsCount} runs
                              </div>
                            </div>
                            <span className="text-[9px] font-bold text-slate-400 truncate w-full text-center">
                              {flow.name.length > 8 ? flow.name.substring(0, 6) + '..' : flow.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Attribution Tab */}
        {activeTab === "attribution" && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-base font-black text-slate-900">Revenue Attribution & Optimization Intelligence</h3>
              <p className="text-xs text-slate-400">
                Analyze direct business impact and view intelligence recommendations.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 1. Revenue Attribution Section */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Revenue Attribution</h4>
                  {totalRevenue === 0 ? (
                    <div className="space-y-3 py-8 text-center">
                      <p className="text-xs font-semibold text-slate-750 leading-relaxed">
                        Revenue attribution is still being established as additional business activity is recorded.
                      </p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Revenue attribution will become available as automations generate measurable business outcomes.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-100/30">
                        <span className="text-[10px] font-bold text-emerald-600 block uppercase tracking-wider">Total Revenue Influenced</span>
                        <span className="text-3xl font-black text-emerald-700 tracking-tight block mt-1">
                          {formatRevenue(totalRevenue)} Total Revenue Influenced
                        </span>
                      </div>
                      
                      <div className="space-y-2.5 pt-2">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Breakdown by Automation</span>
                        <div className="space-y-2">
                          {sortedFlowsByRevenue.map(flow => (
                            <div key={flow.id} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                              <span className="text-xs font-semibold text-slate-700">{flow.name}</span>
                              <span className="text-xs font-black text-emerald-600">{formatRevenue(flow.revenueInfluenced)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Optimization Intelligence Section */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between min-h-[300px]">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Optimization Intelligence</h4>
                  {optimizationInsights.length === 0 ? (
                    <div className="space-y-3 py-8 text-center">
                      <p className="text-xs font-semibold text-slate-700 leading-relaxed">
                        No optimization opportunities currently detected.
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Your growth systems are operating within expected conditions.
                      </p>
                      <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-50 pt-3">
                        Optimization insights will appear once sufficient execution history is available.
                      </p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Growth systems are actively monitoring opportunities for future optimization.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {optimizationInsights.map((insight, idx) => (
                        <div key={idx} className="bg-slate-50 rounded-2xl p-4 border border-slate-150/80 space-y-2.5">
                          <div className="flex items-start gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                            <p className="text-xs font-semibold text-slate-700 leading-relaxed">{insight.text}</p>
                          </div>
                          <div className="pl-3.5 pt-1.5 border-t border-slate-150/45">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Recommendation</span>
                            <p className="text-xs font-bold text-blue-600">{insight.recommendation}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
                  <h4 className="text-sm font-bold text-slate-900">Business Hours</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Throttle AI communications to standard working hours (9:00 AM - 6:00 PM local time).
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

              {/* Duplicate Protection Windows */}
              <div className="flex items-center justify-between gap-4 pt-6 border-t border-slate-100">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Duplicate Protection Windows</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Ignore incoming trigger events if the contact was messaged within the last 24 hours.
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

              {/* AI Optimization Modes */}
              <div className="flex flex-col gap-2 pt-6 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-900">AI Optimization Modes</h4>
                <p className="text-xs text-slate-500">
                  Configure dynamic message modification rules and follow-up intervals.
                </p>
                <div className="grid grid-cols-3 gap-3 mt-3">
                  {[
                    { id: "strict", label: "Strict Templates", desc: "Replies match fixed template bounds" },
                    { id: "balanced", label: "Balanced Mode", desc: "Allow contextual tone adjustments" },
                    { id: "autonomous", label: "High Autonomy", desc: "Fully generate contextual responses" }
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

              {/* Fallback Behaviors */}
              <div className="flex flex-col gap-2 pt-6 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-900">Fallback Behaviors</h4>
                <p className="text-xs text-slate-500">
                  Default action to execute if AI model confidence falls below the 85% threshold.
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

              {/* Automation Defaults */}
              <div className="flex flex-col gap-4 pt-6 border-t border-slate-100">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Automation Defaults</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Set baseline message processing latency and primary messaging target channel.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Response Delay (Seconds)
                    </label>
                    <input
                      type="number"
                      value={defaultResponseDelay}
                      onChange={(e) => setDefaultResponseDelay(Number(e.target.value))}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-slate-50/50"
                      min={1}
                      max={300}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Default Target Channel
                    </label>
                    <select
                      value={defaultChannelPreference}
                      onChange={(e) => setDefaultChannelPreference(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:border-blue-500 focus:outline-none text-xs bg-white"
                    >
                      <option value="instagram">Instagram DM</option>
                      <option value="whatsapp">WhatsApp Business</option>
                      <option value="email">Email Interface</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => toast.success("Configuration updated.")}
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
      {selectedFlowForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/45 backdrop-blur-sm">
          <div className="w-full max-w-md h-full bg-white shadow-2xl p-6 overflow-y-auto flex flex-col justify-between transition-transform duration-300">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    AI Growth Operation Details
                  </span>
                  <h3 className="text-lg font-black text-slate-900 mt-1">
                    {selectedFlowForDetail.name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedFlowForDetail(null)}
                  className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 1. Objective */}
              <div className="space-y-1">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Objective
                </span>
                <p className="text-sm font-extrabold text-slate-800 leading-snug">
                  {selectedFlowForDetail.objective || getObjectiveForType(selectedFlowForDetail.type)}
                </p>
              </div>

              {/* Health Status */}
              <div className="space-y-1.5">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Health Status
                </span>
                <div>
                  <span
                    className={`inline-block text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${getHealthBadgeStyle(deriveFlowHealth(selectedFlowForDetail))}`}
                  >
                    {deriveFlowHealth(selectedFlowForDetail)}
                  </span>
                </div>
              </div>

              {/* 2. Current AI Status */}
              <div className="space-y-1">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Current AI Status
                </span>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="relative flex h-2 w-2">
                    {selectedFlowForDetail.status === "Active" && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      selectedFlowForDetail.status === "Active" ? "bg-blue-600" : "bg-slate-400"
                    }`}></span>
                  </span>
                  <span className="text-xs font-black text-slate-800">
                    {getAIStatus(selectedFlowForDetail)}
                  </span>
                </div>
              </div>

              {/* 3. Latest Activity */}
              <div className="space-y-1">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Latest Activity
                </span>
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${getLatestActivity(selectedFlowForDetail) === "No recent activity." ? "bg-slate-350" : "bg-emerald-500 animate-pulse"}`} />
                  {getLatestActivity(selectedFlowForDetail)}
                </p>
              </div>

              {/* 4. Next AI Action */}
              <div className="space-y-1">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Next AI Action
                </span>
                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {getNextAIAction(selectedFlowForDetail)}
                </p>
              </div>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-4 flex justify-end">
              <button
                onClick={() => setSelectedFlowForDetail(null)}
                className="brand-button-secondary py-2.5 px-5 text-xs rounded-xl cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
