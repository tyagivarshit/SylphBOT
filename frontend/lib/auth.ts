const API = process.env.NEXT_PUBLIC_API_URL

export async function loginUser(email: string, password: string) {

  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password
    })
  })

  return res.json()
}

export async function registerUser(
  name: string,
  email: string,
  password: string
) {

  const res = await fetch(`${API}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name,
      email,
      password
    })
  })

  return res.json()
}

export async function verifyEmail(token: string) {

  const res = await fetch(
    `${API}/api/auth/verify-email?token=${token}`
  )

  return res.json()
}