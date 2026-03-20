import axios from "axios";

const instance = axios.create({
  baseURL: "http://localhost:5000/api", // 🔥 backend URL
  withCredentials: true, // cookies ke liye important
});

export default instance;