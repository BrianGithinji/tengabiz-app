export async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text()

  if (!text.trim()) {
    const message = `Request failed (${res.status}): The server returned an empty response.`
    console.error('[API]', message)
    throw new Error(message)
  }

  try {
    const data = JSON.parse(text) as T
    if (!res.ok) console.error(`[API] ${res.status}`, data)
    return data
  } catch {
    const message = `Request failed (${res.status}): The server returned an invalid response.`
    console.error('[API]', message, text.slice(0, 200))
    throw new Error(message)
  }
}
