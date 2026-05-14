module.exports=[18622,(a,b,c)=>{b.exports=a.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},31699,(a,b,c)=>{"use strict";b.exports=a.r(18622)},57850,(a,b,c)=>{"use strict";b.exports=a.r(31699).vendored["react-ssr"].ReactJsxRuntime},45056,(a,b,c)=>{"use strict";b.exports=a.r(31699).vendored["react-ssr"].React},97134,(a,b,c)=>{"use strict";b.exports=a.r(31699).vendored["react-ssr"].ReactDOM},24361,(a,b,c)=>{b.exports=a.x("util",()=>require("util"))},14747,(a,b,c)=>{b.exports=a.x("path",()=>require("path"))},87973,(a,b,c)=>{"use strict";function d(a){if("function"!=typeof WeakMap)return null;var b=new WeakMap,c=new WeakMap;return(d=function(a){return a?c:b})(a)}c._=function(a,b){if(!b&&a&&a.__esModule)return a;if(null===a||"object"!=typeof a&&"function"!=typeof a)return{default:a};var c=d(b);if(c&&c.has(a))return c.get(a);var e={__proto__:null},f=Object.defineProperty&&Object.getOwnPropertyDescriptor;for(var g in a)if("default"!==g&&Object.prototype.hasOwnProperty.call(a,g)){var h=f?Object.getOwnPropertyDescriptor(a,g):null;h&&(h.get||h.set)?Object.defineProperty(e,g,h):e[g]=a[g]}return e.default=a,c&&c.set(a,e),e}},31261,a=>{"use strict";var b=a.i(45056);let c=(...a)=>a.filter((a,b,c)=>!!a&&""!==a.trim()&&c.indexOf(a)===b).join(" ").trim(),d=a=>{let b=a.replace(/^([A-Z])|[\s-_]+(\w)/g,(a,b,c)=>c?c.toUpperCase():b.toLowerCase());return b.charAt(0).toUpperCase()+b.slice(1)};var e={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};let f=(0,b.forwardRef)(({color:a="currentColor",size:d=24,strokeWidth:f=2,absoluteStrokeWidth:g,className:h="",children:i,iconNode:j,...k},l)=>(0,b.createElement)("svg",{ref:l,...e,width:d,height:d,stroke:a,strokeWidth:g?24*Number(f)/Number(d):f,className:c("lucide",h),...!i&&!(a=>{for(let b in a)if(b.startsWith("aria-")||"role"===b||"title"===b)return!0;return!1})(k)&&{"aria-hidden":"true"},...k},[...j.map(([a,c])=>(0,b.createElement)(a,c)),...Array.isArray(i)?i:[i]])),g=(a,e)=>{let g=(0,b.forwardRef)(({className:g,...h},i)=>(0,b.createElement)(f,{ref:i,iconNode:e,className:c(`lucide-${d(a).replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase()}`,`lucide-${a}`,g),...h}));return g.displayName=d(a),g};a.s(["default",()=>g],31261)},2320,a=>{"use strict";a.i(395);var b=a.i(92032);let c=(a,b)=>{if(null==a)throw Error(b);return a};async function d(){let a=await (0,b.apiFetch)("/api/user/me",{cache:"no-store",timeoutMs:9e3});return a.success?a.data:null}async function e(a){let d=await (0,b.apiFetch)("/api/user/update",{method:"PATCH",body:JSON.stringify(a)});if(!d.success)throw Error(d.message||"Update failed");return c(d.data,"Invalid profile response")}async function f(a){let d=new FormData;d.append("file",a);let e=await (0,b.apiFetch)("/api/user/upload-avatar",{method:"POST",body:d});if(!e.success)throw Error(e.message||"Avatar upload failed");return c(e.data,"Invalid avatar response")}async function g(a){let c=await (0,b.apiFetch)("/api/user/change-password",{method:"POST",body:JSON.stringify(a)});if(!c.success)throw Error(c.message||"Password update failed");return c.data}async function h(){let a=await (0,b.apiFetch)("/api/user/api-key",{cache:"no-store"});if(!a.success||!a.data?.apiKey)throw Error(a.message||"Failed to load API key");return a.data.apiKey}async function i(){let a=await (0,b.apiFetch)("/api/client/status",{cache:"no-store"});if(!a.success)throw Error(a.message||"Failed to load connection status");return c(a.data,"Failed to load connection status")}async function j(){let a=await (0,b.apiFetch)("/api/notifications",{cache:"no-store"});return a.success?{notifications:a.data?.notifications||[],unreadCount:a.data?.unreadCount??0}:{notifications:[],unreadCount:0}}async function k(){let a=await (0,b.apiFetch)("/api/notifications/read-all",{method:"PATCH"});if(!a.success)throw Error(a.message||"Failed to mark notifications as read")}async function l(a){let c=a.trim();if(!c)return[];let d=await (0,b.apiFetch)(`/api/search?q=${encodeURIComponent(c)}`,{cache:"no-store"});return d.success&&Array.isArray(d.data)?d.data:[]}a.s(["changeUserPassword",()=>g,"fetchClientConnectionStatus",()=>i,"fetchCurrentUser",()=>d,"fetchNotifications",()=>j,"fetchWorkspaceApiKey",()=>h,"markAllNotificationsRead",()=>k,"searchApp",()=>l,"updateCurrentUser",()=>e,"uploadUserAvatar",()=>f])},60270,a=>{"use strict";var b=a.i(45056),c=a.i(57850),d=b.createContext(void 0),e=a=>{let c=b.useContext(d);if(a)return a;if(!c)throw Error("No QueryClient set, use QueryClientProvider to set one");return c},f=({client:a,children:e})=>(b.useEffect(()=>(a.mount(),()=>{a.unmount()}),[a]),(0,c.jsx)(d.Provider,{value:a,children:e}));a.s(["QueryClientProvider",()=>f,"useQueryClient",()=>e])},7009,a=>{"use strict";var b=a.i(57850),c=a.i(45056),d=a.i(60270),e=a.i(2320);let f=(0,c.createContext)({user:null,loading:!0,isAuthenticated:!1,refreshUser:async()=>null});a.s(["AuthProvider",0,({children:a})=>{let g=(0,d.useQueryClient)(),[h,i]=(0,c.useState)(null),[j,k]=(0,c.useState)(!0),l=(0,c.useRef)(!1),m=(0,c.useCallback)((a,b,c)=>{},[]),n=a=>{},o=(0,c.useCallback)(async a=>{let b=performance.now();try{let a=await (0,e.fetchCurrentUser)();if(!a)return i(null),n(null),null;return i(a),n(a),g.setQueryData(["me"],a),a}catch{return i(null),n(null),null}finally{m("AUTH_MS",performance.now()-b,{initial:!!a?.isInitial}),a?.isInitial&&k(!1)}},[g,m]);return(0,c.useEffect)(()=>{l.current||(l.current=!0,o({isInitial:!0}))},[o]),(0,c.useEffect)(()=>{let a=()=>void o();return window.addEventListener("auth:refresh",a),()=>window.removeEventListener("auth:refresh",a)},[o]),(0,b.jsx)(f.Provider,{value:{user:h,loading:j,isAuthenticated:!!h,refreshUser:o},children:a})},"useAuth",0,()=>(0,c.useContext)(f)])},47802,a=>{"use strict";let b=(0,a.i(31261).default)("x",[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]);a.s(["X",()=>b],47802)},30796,a=>{"use strict";let b,c;var d,e=a.i(45056);let f={data:""},g=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,h=/\/\*[^]*?\*\/|  +/g,i=/\n+/g,j=(a,b)=>{let c="",d="",e="";for(let f in a){let g=a[f];"@"==f[0]?"i"==f[1]?c=f+" "+g+";":d+="f"==f[1]?j(g,f):f+"{"+j(g,"k"==f[1]?"":b)+"}":"object"==typeof g?d+=j(g,b?b.replace(/([^,])+/g,a=>f.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,b=>/&/.test(b)?b.replace(/&/g,a):a?a+" "+b:b)):f):null!=g&&(f=/^--/.test(f)?f:f.replace(/[A-Z]/g,"-$&").toLowerCase(),e+=j.p?j.p(f,g):f+":"+g+";")}return c+(b&&e?b+"{"+e+"}":e)+d},k={},l=a=>{if("object"==typeof a){let b="";for(let c in a)b+=c+l(a[c]);return b}return a};function m(a){let b,c,d=this||{},e=a.call?a(d.p):a;return((a,b,c,d,e)=>{var f;let m=l(a),n=k[m]||(k[m]=(a=>{let b=0,c=11;for(;b<a.length;)c=101*c+a.charCodeAt(b++)>>>0;return"go"+c})(m));if(!k[n]){let b=m!==a?a:(a=>{let b,c,d=[{}];for(;b=g.exec(a.replace(h,""));)b[4]?d.shift():b[3]?(c=b[3].replace(i," ").trim(),d.unshift(d[0][c]=d[0][c]||{})):d[0][b[1]]=b[2].replace(i," ").trim();return d[0]})(a);k[n]=j(e?{["@keyframes "+n]:b}:b,c?"":"."+n)}let o=c&&k.g?k.g:null;return c&&(k.g=k[n]),f=k[n],o?b.data=b.data.replace(o,f):-1===b.data.indexOf(f)&&(b.data=d?f+b.data:b.data+f),n})(e.unshift?e.raw?(b=[].slice.call(arguments,1),c=d.p,e.reduce((a,d,e)=>{let f=b[e];if(f&&f.call){let a=f(c),b=a&&a.props&&a.props.className||/^go/.test(a)&&a;f=b?"."+b:a&&"object"==typeof a?a.props?"":j(a,""):!1===a?"":a}return a+d+(null==f?"":f)},"")):e.reduce((a,b)=>Object.assign(a,b&&b.call?b(d.p):b),{}):e,d.target||f,d.g,d.o,d.k)}m.bind({g:1});let n,o,p,q=m.bind({k:1});function r(a,b){let c=this||{};return function(){let d=arguments;function e(f,g){let h=Object.assign({},f),i=h.className||e.className;c.p=Object.assign({theme:o&&o()},h),c.o=/ *go\d+/.test(i),h.className=m.apply(c,d)+(i?" "+i:""),b&&(h.ref=g);let j=a;return a[0]&&(j=h.as||a,delete h.as),p&&j[0]&&p(h),n(j,h)}return b?b(e):e}}var s=(a,b)=>"function"==typeof a?a(b):a,t=(b=0,()=>(++b).toString()),u="default",v=(a,b)=>{let{toastLimit:c}=a.settings;switch(b.type){case 0:return{...a,toasts:[b.toast,...a.toasts].slice(0,c)};case 1:return{...a,toasts:a.toasts.map(a=>a.id===b.toast.id?{...a,...b.toast}:a)};case 2:let{toast:d}=b;return v(a,{type:+!!a.toasts.find(a=>a.id===d.id),toast:d});case 3:let{toastId:e}=b;return{...a,toasts:a.toasts.map(a=>a.id===e||void 0===e?{...a,dismissed:!0,visible:!1}:a)};case 4:return void 0===b.toastId?{...a,toasts:[]}:{...a,toasts:a.toasts.filter(a=>a.id!==b.toastId)};case 5:return{...a,pausedAt:b.time};case 6:let f=b.time-(a.pausedAt||0);return{...a,pausedAt:void 0,toasts:a.toasts.map(a=>({...a,pauseDuration:a.pauseDuration+f}))}}},w=[],x={toasts:[],pausedAt:void 0,settings:{toastLimit:20}},y={},z=(a,b=u)=>{y[b]=v(y[b]||x,a),w.forEach(([a,c])=>{a===b&&c(y[b])})},A=a=>Object.keys(y).forEach(b=>z(a,b)),B=(a=u)=>b=>{z(b,a)},C={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},D=(a={},b=u)=>{let[c,d]=(0,e.useState)(y[b]||x),f=(0,e.useRef)(y[b]);(0,e.useEffect)(()=>(f.current!==y[b]&&d(y[b]),w.push([b,d]),()=>{let a=w.findIndex(([a])=>a===b);a>-1&&w.splice(a,1)}),[b]);let g=c.toasts.map(b=>{var c,d,e;return{...a,...a[b.type],...b,removeDelay:b.removeDelay||(null==(c=a[b.type])?void 0:c.removeDelay)||(null==a?void 0:a.removeDelay),duration:b.duration||(null==(d=a[b.type])?void 0:d.duration)||(null==a?void 0:a.duration)||C[b.type],style:{...a.style,...null==(e=a[b.type])?void 0:e.style,...b.style}}});return{...c,toasts:g}},E=a=>(b,c)=>{let d,e=((a,b="blank",c)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:b,ariaProps:{role:"status","aria-live":"polite"},message:a,pauseDuration:0,...c,id:(null==c?void 0:c.id)||t()}))(b,a,c);return B(e.toasterId||(d=e.id,Object.keys(y).find(a=>y[a].toasts.some(a=>a.id===d))))({type:2,toast:e}),e.id},F=(a,b)=>E("blank")(a,b);F.error=E("error"),F.success=E("success"),F.loading=E("loading"),F.custom=E("custom"),F.dismiss=(a,b)=>{let c={type:3,toastId:a};b?B(b)(c):A(c)},F.dismissAll=a=>F.dismiss(void 0,a),F.remove=(a,b)=>{let c={type:4,toastId:a};b?B(b)(c):A(c)},F.removeAll=a=>F.remove(void 0,a),F.promise=(a,b,c)=>{let d=F.loading(b.loading,{...c,...null==c?void 0:c.loading});return"function"==typeof a&&(a=a()),a.then(a=>{let e=b.success?s(b.success,a):void 0;return e?F.success(e,{id:d,...c,...null==c?void 0:c.success}):F.dismiss(d),a}).catch(a=>{let e=b.error?s(b.error,a):void 0;e?F.error(e,{id:d,...c,...null==c?void 0:c.error}):F.dismiss(d)}),a};var G=1e3,H=(a,b="default")=>{let{toasts:c,pausedAt:d}=D(a,b),f=(0,e.useRef)(new Map).current,g=(0,e.useCallback)((a,b=G)=>{if(f.has(a))return;let c=setTimeout(()=>{f.delete(a),h({type:4,toastId:a})},b);f.set(a,c)},[]);(0,e.useEffect)(()=>{if(d)return;let a=Date.now(),e=c.map(c=>{if(c.duration===1/0)return;let d=(c.duration||0)+c.pauseDuration-(a-c.createdAt);if(d<0){c.visible&&F.dismiss(c.id);return}return setTimeout(()=>F.dismiss(c.id,b),d)});return()=>{e.forEach(a=>a&&clearTimeout(a))}},[c,d,b]);let h=(0,e.useCallback)(B(b),[b]),i=(0,e.useCallback)(()=>{h({type:5,time:Date.now()})},[h]),j=(0,e.useCallback)((a,b)=>{h({type:1,toast:{id:a,height:b}})},[h]),k=(0,e.useCallback)(()=>{d&&h({type:6,time:Date.now()})},[d,h]),l=(0,e.useCallback)((a,b)=>{let{reverseOrder:d=!1,gutter:e=8,defaultPosition:f}=b||{},g=c.filter(b=>(b.position||f)===(a.position||f)&&b.height),h=g.findIndex(b=>b.id===a.id),i=g.filter((a,b)=>b<h&&a.visible).length;return g.filter(a=>a.visible).slice(...d?[i+1]:[0,i]).reduce((a,b)=>a+(b.height||0)+e,0)},[c]);return(0,e.useEffect)(()=>{c.forEach(a=>{if(a.dismissed)g(a.id,a.removeDelay);else{let b=f.get(a.id);b&&(clearTimeout(b),f.delete(a.id))}})},[c,g]),{toasts:c,handlers:{updateHeight:j,startPause:i,endPause:k,calculateOffset:l}}},I=q`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,J=q`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,K=q`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,L=r("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${a=>a.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${I} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${J} 0.15s ease-out forwards;
    animation-delay: 150ms;
    position: absolute;
    border-radius: 3px;
    opacity: 0;
    background: ${a=>a.secondary||"#fff"};
    bottom: 9px;
    left: 4px;
    height: 2px;
    width: 12px;
  }

  &:before {
    animation: ${K} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,M=q`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,N=r("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${a=>a.secondary||"#e0e0e0"};
  border-right-color: ${a=>a.primary||"#616161"};
  animation: ${M} 1s linear infinite;
`,O=q`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,P=q`
0% {
	height: 0;
	width: 0;
	opacity: 0;
}
40% {
  height: 0;
	width: 6px;
	opacity: 1;
}
100% {
  opacity: 1;
  height: 10px;
}`,Q=r("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${a=>a.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${O} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${P} 0.2s ease-out forwards;
    opacity: 0;
    animation-delay: 200ms;
    position: absolute;
    border-right: 2px solid;
    border-bottom: 2px solid;
    border-color: ${a=>a.secondary||"#fff"};
    bottom: 6px;
    left: 6px;
    height: 10px;
    width: 6px;
  }
`,R=r("div")`
  position: absolute;
`,S=r("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,T=q`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,U=r("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${T} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,V=({toast:a})=>{let{icon:b,type:c,iconTheme:d}=a;return void 0!==b?"string"==typeof b?e.createElement(U,null,b):b:"blank"===c?null:e.createElement(S,null,e.createElement(N,{...d}),"loading"!==c&&e.createElement(R,null,"error"===c?e.createElement(L,{...d}):e.createElement(Q,{...d})))},W=r("div")`
  display: flex;
  align-items: center;
  background: #fff;
  color: #363636;
  line-height: 1.3;
  will-change: transform;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05);
  max-width: 350px;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 8px;
`,X=r("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,Y=e.memo(({toast:a,position:b,style:d,children:f})=>{let g=a.height?((a,b)=>{let d=a.includes("top")?1:-1,[e,f]=c?["0%{opacity:0;} 100%{opacity:1;}","0%{opacity:1;} 100%{opacity:0;}"]:[`
0% {transform: translate3d(0,${-200*d}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${-150*d}%,-1px) scale(.6); opacity:0;}
`];return{animation:b?`${q(e)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${q(f)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}})(a.position||b||"top-center",a.visible):{opacity:0},h=e.createElement(V,{toast:a}),i=e.createElement(X,{...a.ariaProps},s(a.message,a));return e.createElement(W,{className:a.className,style:{...g,...d,...a.style}},"function"==typeof f?f({icon:h,message:i}):e.createElement(e.Fragment,null,h,i))});d=e.createElement,j.p=void 0,n=d,o=void 0,p=void 0;var Z=({id:a,className:b,style:c,onHeightUpdate:d,children:f})=>{let g=e.useCallback(b=>{if(b){let c=()=>{d(a,b.getBoundingClientRect().height)};c(),new MutationObserver(c).observe(b,{subtree:!0,childList:!0,characterData:!0})}},[a,d]);return e.createElement("div",{ref:g,className:b,style:c},f)},$=m`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,_=({reverseOrder:a,position:b="top-center",toastOptions:d,gutter:f,children:g,toasterId:h,containerStyle:i,containerClassName:j})=>{let{toasts:k,handlers:l}=H(d,h);return e.createElement("div",{"data-rht-toaster":h||"",style:{position:"fixed",zIndex:9999,top:16,left:16,right:16,bottom:16,pointerEvents:"none",...i},className:j,onMouseEnter:l.startPause,onMouseLeave:l.endPause},k.map(d=>{let h,i,j=d.position||b,k=l.calculateOffset(d,{reverseOrder:a,gutter:f,defaultPosition:b}),m=(h=j.includes("top"),i=j.includes("center")?{justifyContent:"center"}:j.includes("right")?{justifyContent:"flex-end"}:{},{left:0,right:0,display:"flex",position:"absolute",transition:c?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${k*(h?1:-1)}px)`,...h?{top:0}:{bottom:0},...i});return e.createElement(Z,{id:d.id,key:d.id,onHeightUpdate:l.updateHeight,className:d.visible?$:"",style:m},"custom"===d.type?s(d.message,d):g?g(d):e.createElement(Y,{toast:d,position:j}))}))};a.s(["CheckmarkIcon",()=>Q,"ErrorIcon",()=>L,"LoaderIcon",()=>N,"ToastBar",()=>Y,"ToastIcon",()=>V,"Toaster",()=>_,"default",()=>F,"resolveValue",()=>s,"toast",()=>F,"useToaster",()=>H,"useToasterStore",()=>D],30796)},29018,a=>{"use strict";var b=a.i(95783),c=a.i(13818),d=a.i(43862),e=class extends c.Removable{#a;#b;#c;#d;constructor(a){super(),this.#a=a.client,this.mutationId=a.mutationId,this.#c=a.mutationCache,this.#b=[],this.state=a.state||f(),this.setOptions(a.options),this.scheduleGc()}setOptions(a){this.options=a,this.updateGcTime(this.options.gcTime)}get meta(){return this.options.meta}addObserver(a){this.#b.includes(a)||(this.#b.push(a),this.clearGcTimeout(),this.#c.notify({type:"observerAdded",mutation:this,observer:a}))}removeObserver(a){this.#b=this.#b.filter(b=>b!==a),this.scheduleGc(),this.#c.notify({type:"observerRemoved",mutation:this,observer:a})}optionalRemove(){this.#b.length||("pending"===this.state.status?this.scheduleGc():this.#c.remove(this))}continue(){return this.#d?.continue()??this.execute(this.state.variables)}async execute(a){let b=()=>{this.#e({type:"continue"})},c={client:this.#a,meta:this.options.meta,mutationKey:this.options.mutationKey};this.#d=(0,d.createRetryer)({fn:()=>this.options.mutationFn?this.options.mutationFn(a,c):Promise.reject(Error("No mutationFn found")),onFail:(a,b)=>{this.#e({type:"failed",failureCount:a,error:b})},onPause:()=>{this.#e({type:"pause"})},onContinue:b,retry:this.options.retry??0,retryDelay:this.options.retryDelay,networkMode:this.options.networkMode,canRun:()=>this.#c.canRun(this)});let e="pending"===this.state.status,f=!this.#d.canStart();try{if(e)b();else{this.#e({type:"pending",variables:a,isPaused:f}),this.#c.config.onMutate&&await this.#c.config.onMutate(a,this,c);let b=await this.options.onMutate?.(a,c);b!==this.state.context&&this.#e({type:"pending",context:b,variables:a,isPaused:f})}let d=await this.#d.start();return await this.#c.config.onSuccess?.(d,a,this.state.context,this,c),await this.options.onSuccess?.(d,a,this.state.context,c),await this.#c.config.onSettled?.(d,null,this.state.variables,this.state.context,this,c),await this.options.onSettled?.(d,null,a,this.state.context,c),this.#e({type:"success",data:d}),d}catch(b){try{await this.#c.config.onError?.(b,a,this.state.context,this,c)}catch(a){Promise.reject(a)}try{await this.options.onError?.(b,a,this.state.context,c)}catch(a){Promise.reject(a)}try{await this.#c.config.onSettled?.(void 0,b,this.state.variables,this.state.context,this,c)}catch(a){Promise.reject(a)}try{await this.options.onSettled?.(void 0,b,a,this.state.context,c)}catch(a){Promise.reject(a)}throw this.#e({type:"error",error:b}),b}finally{this.#c.runNext(this)}}#e(a){this.state=(b=>{switch(a.type){case"failed":return{...b,failureCount:a.failureCount,failureReason:a.error};case"pause":return{...b,isPaused:!0};case"continue":return{...b,isPaused:!1};case"pending":return{...b,context:a.context,data:void 0,failureCount:0,failureReason:null,error:null,isPaused:a.isPaused,status:"pending",variables:a.variables,submittedAt:Date.now()};case"success":return{...b,data:a.data,failureCount:0,failureReason:null,error:null,status:"success",isPaused:!1};case"error":return{...b,data:void 0,error:a.error,failureCount:b.failureCount+1,failureReason:a.error,isPaused:!1,status:"error"}}})(this.state),b.notifyManager.batch(()=>{this.#b.forEach(b=>{b.onMutationUpdate(a)}),this.#c.notify({mutation:this,type:"updated",action:a})})}};function f(){return{context:void 0,data:void 0,error:null,failureCount:0,failureReason:null,isPaused:!1,status:"idle",variables:void 0,submittedAt:0}}a.s(["Mutation",()=>e,"getDefaultState",()=>f])},35983,a=>{"use strict";let b=(0,a.i(31261).default)("download",[["path",{d:"M12 15V3",key:"m9g1x1"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["path",{d:"m7 10 5 5 5-5",key:"brsn70"}]]);a.s(["Download",()=>b],35983)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__1ddbf6e2._.js.map