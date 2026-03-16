import { Request, Response } from "express"
import passport from "passport"
import prisma from "../config/prisma"
import {
generateAccessToken,
generateRefreshToken
} from "../utils/generateToken"

export const googleAuth = passport.authenticate(
"google",
{ scope:["profile","email"] }
)

export const googleCallback = async (
req:Request,
res:Response
)=>{

try{

const user = req.user as any

if(!user){
return res.redirect(
`${process.env.FRONTEND_URL}/auth/login`
)
}

let business = await prisma.business.findFirst({
where:{ ownerId:user.id }
})

/* create business if missing */

if(!business){

business = await prisma.business.create({
data:{
name:`${user.name}'s Business`,
ownerId:user.id
}
})

}

/* create tokens */

const accessToken = generateAccessToken(
user.id,
user.role,
business.id
)

const refreshToken = generateRefreshToken(user.id)

const expiry = new Date()
expiry.setDate(expiry.getDate()+7)

await prisma.refreshToken.create({
data:{
token:refreshToken,
userId:user.id,
expiresAt:expiry
}
})

/* set cookies */

res.cookie("accessToken", accessToken, {
httpOnly:true,
secure:process.env.NODE_ENV==="production",
sameSite:"lax",
maxAge:15*60*1000
})

res.cookie("refreshToken", refreshToken, {
httpOnly:true,
secure:process.env.NODE_ENV==="production",
sameSite:"lax",
maxAge:7*24*60*60*1000
})

/* redirect dashboard */

return res.redirect(
`${process.env.FRONTEND_URL}/dashboard`
)

}catch(error){

console.error("Google Auth Error:",error)

return res.redirect(
`${process.env.FRONTEND_URL}/auth/login`
)

}

}