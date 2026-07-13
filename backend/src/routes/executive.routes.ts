import { Router } from "express";
import {
  executeExecutiveRuntimeController,
  getExecutiveRuntimeAuditController,
} from "../controllers/executive.controller";
import { auditRequest } from "../middleware/audit.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { attachBillingContext } from "../middleware/subscription.middleware";
import { requireBusinessContext } from "../middleware/tenant.middleware";

const router = Router();
router.use((req,res,next)=>{
    console.info("EXEC_ROUTER_USE",{
        url:req.originalUrl,
        path:req.path,
        method:req.method
    });
    next();
});
router.use((req,res,next)=>{
    console.info("AFTER_ROUTER");
    next();
});
router.use(requireBusinessContext);
router.use((req,res,next)=>{
    console.info("AFTER_BUSINESS");
    next();
});
router.use(requirePermission("analytics:view"));
router.use((req,res,next)=>{
    console.info("AFTER_PERMISSION");
    next();
});
router.use(attachBillingContext);
router.use((req,res,next)=>{
    console.info("AFTER_BILLING");
    next();
});
router.post(
  "/runtime/execute",

  (req, res, next) => {
    console.info("EXEC_ROUTE_ENTER", {
      requestId: req.requestId,
      route: req.originalUrl,
      method: req.method,
    });

    next();
  },

  auditRequest("executive.runtime_execute"),

  executeExecutiveRuntimeController
);

router.get("/runtime/audit", getExecutiveRuntimeAuditController);

export default router;
