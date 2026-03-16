"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";

export default function GoogleSuccessPage(){

const router = useRouter();
const params = useSearchParams();

useEffect(()=>{

const token = params.get("token");

if(!token){
toast.error("Google login failed");
router.replace("/auth/login");
return;
}

/* store token */

localStorage.setItem("accessToken",token);

toast.success("Google login successful 🚀");

/* redirect dashboard */

router.replace("/dashboard");

},[params,router]);

return(

<div className="min-h-screen flex items-center justify-center">

<p className="text-gray-600 text-sm">
Signing you in...
</p>

</div>

);

}