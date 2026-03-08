import type { CareTask, DashboardData, Diagnosis, Plant, ProgressSnapshot, User } from './types'

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/$/, '')

type LoginResponse = {
  token: string
  user: User
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })

  if (!res.ok) {
    const payload = await res.text()
    throw new Error(payload || `HTTP ${res.status}`)
  }

  return (await res.json()) as T
}

export const api = {
  login(email: string, password: string) {
    return request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },
  register(email: string, name: string, password: string) {
    return request<LoginResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, name, password }),
    })
  },
  getDashboard(token: string) {
    return request<DashboardData>('/dashboard', {}, token)
  },
  getPlants(token: string) {
    return request<Plant[]>('/plants', {}, token)
  },
  createPlant(
    token: string,
    data: Pick<Plant, 'name' | 'speciesGuess' | 'location' | 'lightLevel'>,
  ) {
    return request<Plant>(
      '/plants',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      token,
    )
  },
  getPlant(token: string, plantId: string) {
    return request<{ plant: Plant; diagnoses: Diagnosis[]; tasks: CareTask[] }>(`/plants/${plantId}`, {}, token)
  },
  diagnosePlant(
    token: string,
    plantId: string,
    payload: { imageUrl: string; note?: string; context: string; language?: string },
  ) {
    return request<{ diagnosis: Diagnosis; generatedTasks: CareTask[] }>(
      `/plants/${plantId}/diagnose`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token,
    )
  },
  getTasksToday(token: string) {
    return request<CareTask[]>('/tasks/today', {}, token)
  },
  updateTaskStatus(token: string, taskId: string, status: CareTask['status']) {
    return request<CareTask>(
      `/tasks/${taskId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
      token,
    )
  },
  getProgress(token: string) {
    return request<ProgressSnapshot[]>('/progress', {}, token)
  },
  updatePlantColor(token: string, plantId: string, colorRgb: string) {
    return request<Plant>(`/plants/${plantId}/color`, {
      method: 'PATCH',
      body: JSON.stringify({ colorRgb }),
    }, token)
  },
}
