import axios from "axios";

export const api = axios.create({
  baseURL: "http://YOUR_BACKEND_IP:8000/api/v1",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});