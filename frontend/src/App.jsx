import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const APP_NAME = 'Carbon Footprint'

// Fill these in with your real data sources.
const DATA_SOURCES = {
  vehicles: 'Vehicle fuel-economy data: [add your source here]',
  factors: 'Emission factors: [add your source here]'
}

const SUGGESTIONS = [
  ['📊', 'Which of my vehicles emits the most?'],
  ['🌱', 'Suggest a greener alternative to my most-used vehicle.'],
  ['⬇️', 'How can I reduce my emissions?'],
  ['🧮', 'How is my CO₂ calculated?']
]

function LeafLogo() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 19c3-5 6-8 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function BudgetBanner({ percent, budget, total, emailNotice }) {
  if (percent < 80) return null

  const over = percent >= 100
  const high = percent >= 90

  return (
    <div
      className={over ? 'alert-banner over' : high ? 'alert-banner high' : 'alert-banner warn'}
      role="alert"
    >
      <strong>
        {over
          ? 'You have used your whole carbon budget.'
          : `You have used ${percent}% of your carbon budget.`}
      </strong>
      <span>
        {total.toFixed(2)} kg of {budget} kg.
        {emailNotice ? ` ${emailNotice}` : ''}
      </span>
    </div>
  )
}

const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['year', 'Year']
]

const THIS_PERIOD = {
  day: 'today',
  week: 'this week',
  month: 'this month',
  year: 'this year'
}

const LAST_PERIOD = {
  day: 'Yesterday',
  week: 'Last week',
  month: 'Last month',
  year: 'Last year'
}

function kg(value) {
  return Number(value || 0).toFixed(2)
}

function TrackingPanel({ period, onPeriodChange, summary, loading, error }) {
  const shown = summary?.period || period
  const trend = summary?.trend || []
  const maxValue = Math.max(...trend.map((bucket) => bucket.co2Kg), 0)
  const totals = summary?.totals

  return (
    <section
      className={loading && summary ? 'panel track is-loading' : 'panel track'}
      aria-labelledby="track-title"
    >
      <div className="track-head">
        <div>
          <h3 id="track-title">Emission tracking</h3>
          {summary && (
            <p className="muted">
              {summary.periodTitle}: {summary.rangeText}
            </p>
          )}
        </div>

        <div className="seg" role="group" aria-label="Tracking period">
          {PERIODS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={period === value ? 'seg-btn active' : 'seg-btn'}
              aria-pressed={period === value}
              onClick={() => onPeriodChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="history-error">{error}</p>}
      {!summary && loading && <p className="muted">Loading tracking data...</p>}

      {summary && totals && (
        <>
          <div className="track-body">
            <div className="track-total">
              <span className="track-total-label">
                Estimated CO₂ {THIS_PERIOD[shown]}
              </span>

              <div className="track-total-num">
                {kg(totals.co2Kg)} <small>kg</small>
              </div>

              <p className="track-prev">
                {LAST_PERIOD[shown]}: {kg(summary.previousCo2Kg)} kg
              </p>

              <div className="track-stats">
                <div>
                  <span className="track-stat-value">{totals.distanceKm.toFixed(1)}</span>
                  <span className="track-stat-label">km travelled</span>
                </div>
                <div>
                  <span className="track-stat-value">{totals.fuelLitres.toFixed(1)}</span>
                  <span className="track-stat-label">litres of fuel</span>
                </div>
                <div>
                  <span className="track-stat-value">{totals.calculations}</span>
                  <span className="track-stat-label">calculations</span>
                </div>
              </div>
            </div>

            <div className="track-chart">
              <div
                className="track-bars"
                role="img"
                aria-label={`Estimated CO2 for each of the last ${trend.length} ${shown}s`}
              >
                {trend.map((bucket) => {
                  const ratio = maxValue > 0 ? bucket.co2Kg / maxValue : 0

                  return (
                    <div
                      key={bucket.key}
                      className={bucket.isCurrent ? 'track-col current' : 'track-col'}
                      title={`${bucket.label}: ${kg(bucket.co2Kg)} kg from ${bucket.calculations} calculation${bucket.calculations === 1 ? '' : 's'}`}
                    >
                      <span className="track-val">
                        {bucket.co2Kg > 0 ? bucket.co2Kg.toFixed(1) : ''}
                      </span>
                      <div
                        className={bucket.co2Kg > 0 ? 'track-bar' : 'track-bar zero'}
                        style={{ '--bar': ratio }}
                      />
                      <span className="track-lab">{bucket.label}</span>
                    </div>
                  )
                })}
              </div>

              {totals.calculations === 0 && (
                <p className="muted track-empty">
                  Nothing calculated {THIS_PERIOD[shown]} yet. Use the calculator to add a trip.
                </p>
              )}
            </div>
          </div>

          <div className="track-vehicles">
            <h4>Emissions by vehicle, {THIS_PERIOD[shown]}</h4>

            {summary.vehicles.length === 0 ? (
              <p className="muted">No vehicles used {THIS_PERIOD[shown]}.</p>
            ) : (
              <ol className="rank">
                {summary.vehicles.map((vehicle) => (
                  <li key={vehicle.name}>
                    <div className="rank-top">
                      <span className="rank-name">
                        {vehicle.name}
                        <small>
                          {vehicle.distanceKm.toFixed(1)} km, {vehicle.calculations}{' '}
                          {vehicle.calculations === 1 ? 'calculation' : 'calculations'}
                        </small>
                      </span>
                      <strong>{kg(vehicle.co2Kg)} kg</strong>
                    </div>
                    <div className="rank-track">
                      <div
                        className="rank-fill"
                        style={{
                          width: `${totals.co2Kg > 0 ? (vehicle.co2Kg / totals.co2Kg) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  )
}


function App() {
  const [vehicleMake, setVehicleMake] = useState('')
  const [vehicleModel, setVehicleModel] = useState('')
  const [modelYear, setModelYear] = useState('')
  const [distanceTravelled, setDistanceTravelled] = useState('')
  const [currentMileage, setCurrentMileage] = useState('')
  const [emissionResult, setEmissionResult] = useState(null)
  const [calcDetails, setCalcDetails] = useState(null)

  const [backendVehicles, setBackendVehicles] = useState([])
  const [backendEmissionFactors, setBackendEmissionFactors] = useState([])

  const [showHistory, setShowHistory] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)

  const [historyRecords, setHistoryRecords] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const [authToken, setAuthToken] = useState(
    () => localStorage.getItem('ecoTrackToken') || ''
  )

  const [authUser, setAuthUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('ecoTrackUser')
      return savedUser ? JSON.parse(savedUser) : null
    } catch {
      return null
    }
  })

  const [authMode, setAuthMode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('resetToken') ? 'reset' : 'login'
  })

  const [resetToken] = useState(() => {
    return new URLSearchParams(window.location.search).get('resetToken') || ''
  })

  const [resetPassword, setResetPassword] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [resetLink, setResetLink] = useState('')

  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  const [showAssistant, setShowAssistant] = useState(false)
  const [assistantMessages, setAssistantMessages] = useState([])
  const [assistantInput, setAssistantInput] = useState('')
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantError, setAssistantError] = useState('')
  const chatEndRef = useRef(null)

  // Budget and email-alert settings, stored on the server for each user.
  const [savedBudget, setSavedBudget] = useState(500)
  const [budgetInput, setBudgetInput] = useState('500')
  const [alertEmail, setAlertEmail] = useState('')
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [emailConfigured, setEmailConfigured] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [alertNotice, setAlertNotice] = useState('')

  // Emission tracking by day, week, month and year.
  const [trackPeriod, setTrackPeriod] = useState('week')
  const [trackSummary, setTrackSummary] = useState(null)
  const [trackLoading, setTrackLoading] = useState(false)
  const [trackError, setTrackError] = useState('')
  const trackRequestId = useRef(0)

  async function loadTracking(period) {
    const requestId = ++trackRequestId.current
    setTrackLoading(true)
    setTrackError('')

    try {
      // Send the browser's UTC offset so "today" matches the user's own calendar day.
      const tzMinutes = -new Date().getTimezoneOffset()
      const response = await fetch(
        `${API_URL}/api/history/summary?period=${period}&tz=${tzMinutes}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      )
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not load emission tracking.')
      }

      // Ignore answers that arrive after the user has already switched tabs.
      if (requestId === trackRequestId.current) setTrackSummary(data)
    } catch (error) {
      if (requestId === trackRequestId.current) {
        setTrackError(error.message || 'Could not connect to the backend.')
      }
    } finally {
      if (requestId === trackRequestId.current) setTrackLoading(false)
    }
  }

  async function loadSettings(token) {
    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not load settings.')
      }

      setSavedBudget(data.carbonBudget)
      setBudgetInput(String(data.carbonBudget))
      setAlertEmail(data.alertEmail || authUser?.email || '')
      setAlertsEnabled(Boolean(data.alertsEnabled))
      setEmailConfigured(Boolean(data.emailConfigured))
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  async function saveSettings(event) {
    event.preventDefault()
    setSettingsMessage('')
    setSettingsError('')
    setSettingsSaving(true)

    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          carbonBudget: Number(budgetInput),
          alertEmail: alertEmail.trim(),
          alertsEnabled
        })
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not save settings.')
      }

      setSavedBudget(data.carbonBudget)
      setEmailConfigured(Boolean(data.emailConfigured))
      setSettingsMessage('Settings saved.')
    } catch (error) {
      setSettingsError(error.message || 'Could not connect to the backend.')
    } finally {
      setSettingsSaving(false)
    }
  }

  async function sendSummaryEmail() {
    setSettingsMessage('')
    setSettingsError('')

    try {
      const response = await fetch(`${API_URL}/api/settings/send-summary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not send the summary.')
      }

      setSettingsMessage(data.message || 'Summary sent.')
    } catch (error) {
      setSettingsError(error.message || 'Could not connect to the backend.')
    }
  }

  async function sendTestEmail() {
    setSettingsMessage('')
    setSettingsError('')

    try {
      const response = await fetch(`${API_URL}/api/settings/test-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` }
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not send the test email.')
      }

      setSettingsMessage(data.message || 'Test email sent.')
    } catch (error) {
      setSettingsError(error.message || 'Could not connect to the backend.')
    }
  }

  // Load vehicle and emission-factor data from the backend.
  useEffect(() => {
    fetch(`${API_URL}/api/vehicles`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch vehicles')
        }
        return response.json()
      })
      .then((data) => setBackendVehicles(data))
      .catch((error) => console.error('Error fetching vehicles:', error))

    fetch(`${API_URL}/api/emission-factors`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch emission factors')
        }
        return response.json()
      })
      .then((data) => setBackendEmissionFactors(data))
      .catch((error) =>
        console.error('Error fetching emission factors:', error)
      )
  }, [])

  // Once logged in, load history (for the budget warning) and settings.
  useEffect(() => {
    if (authToken) {
      loadHistory()
      loadSettings(authToken)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  // Load the tracking totals whenever the Dashboard opens or the period changes.
  useEffect(() => {
    if (authToken && showDashboard) loadTracking(trackPeriod)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, showDashboard, trackPeriod])

  // Keep the newest assistant message in view.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [assistantMessages, assistantLoading])

  async function handleAuthSubmit(event) {
    event.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    const isRegister = authMode === 'register'

    try {
      const response = await fetch(
        `${API_URL}/api/auth/${isRegister ? 'register' : 'login'}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(
            isRegister
              ? {
                  name: authName.trim(),
                  email: authEmail.trim(),
                  password: authPassword
                }
              : {
                  email: authEmail.trim(),
                  password: authPassword
                }
          )
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || data.message || 'Authentication failed.'
        )
      }

      localStorage.setItem('ecoTrackToken', data.token)
      localStorage.setItem('ecoTrackUser', JSON.stringify(data.user))

      setAuthToken(data.token)
      setAuthUser(data.user)
      setAuthPassword('')
      setAuthError('')
    } catch (error) {
      setAuthError(
        error.message || 'Could not connect to the backend.'
      )
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault()
    setAuthError('')
    setResetMessage('')
    setResetLink('')
    setAuthLoading(true)

    try {
      const response = await fetch(
        `${API_URL}/api/auth/forgot-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: authEmail.trim()
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not request password reset.')
      }

      setResetMessage(data.message || 'Reset request completed.')

      // For local development only.
      if (data.resetLink) {
        setResetLink(data.resetLink)
      }
    } catch (error) {
      setAuthError(error.message || 'Could not connect to the backend.')
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault()
    setAuthError('')
    setResetMessage('')
    setAuthLoading(true)

    try {
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: resetToken,
          password: resetPassword
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not reset password.')
      }

      setResetMessage(data.message || 'Password reset successfully.')
      setResetPassword('')
      setAuthError('')
      setAuthMode('login')
      window.history.replaceState({}, '', '/')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  function handleLogout() {
    setShowAssistant(false)
    setAssistantMessages([])
    localStorage.removeItem('ecoTrackToken')
    localStorage.removeItem('ecoTrackUser')

    setAuthToken('')
    setAuthUser(null)
    setHistoryRecords([])
    setTrackSummary(null)
    setTrackError('')
    setEmissionResult(null)
    setAuthEmail('')
    setAuthPassword('')
    setAuthName('')
    setAuthMode('login')
    setShowHistory(false)
    setShowDashboard(false)
    setAlertNotice('')
    setSavedBudget(500)
    setBudgetInput('500')
    setAlertEmail('')
    setAlertsEnabled(false)
    setSettingsMessage('')
    setSettingsError('')
  }

  async function loadHistory() {
    if (!authToken) {
      setHistoryError('Please log in to view your history.')
      return
    }

    setHistoryLoading(true)
    setHistoryError('')

    try {
      const response = await fetch(`${API_URL}/api/history`, {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || data.message || 'Could not load calculation history.'
        )
      }

      setHistoryRecords(data)
    } catch (error) {
      console.error('Error loading history:', error)
      setHistoryError(
        error.message || 'Could not load history. Make sure the backend is running.'
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  async function clearHistory() {
    const confirmed = window.confirm(
      'Delete all your saved calculations? This cannot be undone.'
    )

    if (!confirmed) return

    setHistoryError('')

    try {
      const response = await fetch(`${API_URL}/api/history`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not clear history.')
      }

      setHistoryRecords([])
      setEmissionResult(null)
      setCalcDetails(null)
      setAlertNotice('')
    } catch (error) {
      setHistoryError(error.message || 'Could not connect to the backend.')
    }
  }

  function openDashboard() {
    setShowAssistant(false)
    setShowDashboard(true)
    setShowHistory(false)
    loadHistory()
  }

  function openHistory() {
    setShowAssistant(false)
    setShowHistory(true)
    setShowDashboard(false)
    loadHistory()
  }

  function openAssistant() {
    setShowAssistant(true)
    setShowDashboard(false)
    setShowHistory(false)
  }

  function openCalculator() {
    setShowAssistant(false)
    setShowHistory(false)
    setShowDashboard(false)
  }

  async function sendAssistantMessage(text) {
    const content = (text ?? assistantInput).trim()

    if (!content || assistantLoading) return

    const token = localStorage.getItem('ecoTrackToken')

    if (!token) {
      setAssistantError('Please log in to use the AI assistant.')
      return
    }

    const next = [
      ...assistantMessages,
      { role: 'user', content }
    ]

    setAssistantMessages(next)
    setAssistantInput('')
    setAssistantError('')
    setAssistantLoading(true)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 45000)
    const startedAt = performance.now()

    try {
      const response = await fetch(`${API_URL}/api/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: content }),
        signal: controller.signal
      })

      console.log(
        `Assistant response received in ${(
          (performance.now() - startedAt) / 1000
        ).toFixed(2)} seconds`
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get an AI response.')
      }

      setAssistantMessages([
        ...next,
        { role: 'assistant', content: data.reply }
      ])
    } catch (error) {
      if (error.name === 'AbortError') {
        setAssistantError(
          'The assistant took too long to respond. Please try again.'
        )
      } else {
        setAssistantError(
          error.message || 'Could not connect to the AI assistant.'
        )
      }
    } finally {
      clearTimeout(timeoutId)
      setAssistantLoading(false)
    }
  }

  function getSelectedVehicle() {
    return backendVehicles.find(
      (vehicle) =>
        vehicle.make === vehicleMake &&
        vehicle.model === vehicleModel &&
        vehicle.year === Number(modelYear)
    )
  }

  const selectedVehicle = getSelectedVehicle()

  function calculateEmissions() {
    const distance = Number(distanceTravelled)

    if (!selectedVehicle) {
      alert('Please select a vehicle.')
      return
    }

    if (!Number.isFinite(distance) || distance <= 0) {
      alert('Please enter a valid distance.')
      return
    }

    const enteredMileage = currentMileage.trim()
    const referenceMileage = selectedVehicle.fuelEconomy

    const mileage =
      enteredMileage !== ''
        ? Number(enteredMileage)
        : referenceMileage !== null && referenceMileage !== ''
          ? Number(referenceMileage)
          : NaN

    if (!Number.isFinite(mileage) || mileage <= 0) {
      alert(
        'Reference mileage is not available for this vehicle. Please enter your current mileage.'
      )
      return
    }

    const emissionFactorData = backendEmissionFactors.find(
      (factor) => factor.fuelType === selectedVehicle.fuelType
    )

    const emissionFactor = Number(emissionFactorData?.factor)

    if (!Number.isFinite(emissionFactor) || emissionFactor <= 0) {
      alert('A valid emission factor is not available for this fuel type.')
      return
    }

    const fuelConsumed = distance / mileage
    const result = fuelConsumed * emissionFactor

    setAlertNotice('')
    setEmissionResult(result)
    setCalcDetails({
      distance,
      mileage,
      mileageSource:
        enteredMileage !== '' ? 'entered by you' : 'reference value for this vehicle',
      fuelConsumed,
      emissionFactor,
      fuelType: selectedVehicle.fuelType
    })

    // Save the calculation for the currently authenticated user.
    fetch(`${API_URL}/api/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        vehicleMake: selectedVehicle.make,
        vehicleModel: selectedVehicle.model,
        modelYear: selectedVehicle.year,
        distanceKm: distance,
        mileageKmPerLitre: mileage,
        fuelConsumedLitres: fuelConsumed,
        emissionFactor,
        co2Kg: result
      })
    })
      .then(async (response) => {
        const data = await response.json()

        if (!response.ok) {
          throw new Error(
            data.error || data.message || 'Failed to save calculation history.'
          )
        }

        return data
      })
      .then((data) => {
        console.log(data.message || 'Calculation saved.')
        loadHistory()

        if (data.alert?.emailSent) {
          setAlertNotice('An alert email was sent.')
        }
      })
      .catch((error) => {
        console.error('Error saving calculation:', error)
        alert(
          'Your result was calculated, but it could not be saved to history. Please check your login and backend.'
        )
      })
  }

  const totalCalculations = historyRecords.length

  const totalDistance = historyRecords.reduce(
    (total, record) => total + Number(record.distanceKm || 0),
    0
  )

  const totalFuel = historyRecords.reduce(
    (total, record) => total + Number(record.fuelConsumedLitres || 0),
    0
  )

  const totalCO2 = historyRecords.reduce(
    (total, record) => total + Number(record.co2Kg || 0),
    0
  )

  // Trend bars: CO2 per calculation, oldest to newest (up to 12).
  const trendRecords = historyRecords.slice(0, 12).reverse()
  const trendMax = Math.max(
    ...trendRecords.map((record) => Number(record.co2Kg || 0)),
    1
  )

  // Budget progress.
  const budgetNumber = Number(savedBudget) > 0 ? Number(savedBudget) : 500
  const budgetPercentRaw = Math.round((totalCO2 / budgetNumber) * 100)
  const budgetPercent = Math.min(budgetPercentRaw, 100)

  // Highest-emitting vehicles.
  const vehicleTotals = {}
  historyRecords.forEach((record) => {
    const key = `${record.vehicleMake} ${record.vehicleModel}`
    vehicleTotals[key] = (vehicleTotals[key] || 0) + Number(record.co2Kg || 0)
  })
  const topVehicles = Object.entries(vehicleTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
  const topVehicleMax = Math.max(...topVehicles.map((entry) => entry[1]), 1)

  const activeView = showAssistant
    ? 'assistant'
    : showDashboard
      ? 'dashboard'
      : showHistory
        ? 'history'
        : 'calculator'

  // ---------------------------------------------------------------
  // LOGIN / REGISTER / FORGOT / RESET  (centred card)
  // ---------------------------------------------------------------
  if (!authToken || authMode === 'reset') {
    const titles = {
      login: ['Welcome back', 'Sign in to keep tracking your trips.'],
      register: ['Create your account', 'Start measuring your carbon footprint.'],
      forgot: ['Forgot password', 'Enter your email and we will send a reset link.'],
      reset: ['Reset password', 'Choose a new password for your account.']
    }
    const [title, subtitle] = titles[authMode] || titles.login

    return (
      <div className="login-page">
        <div className="login-card">
          <div className="brand">
            <LeafLogo />
            <span>{APP_NAME}</span>
          </div>

          <h1>{title}</h1>
          <p className="login-sub">{subtitle}</p>

          {resetMessage && <p className="notice">{resetMessage}</p>}

          {authMode === 'forgot' && (
            <>
              <form onSubmit={handleForgotPassword}>
                <label htmlFor="forgot-email">Email address</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />

                {authError && <p className="history-error">{authError}</p>}

                {resetLink && (
                  <p className="notice">
                    <a href={resetLink}>Open password reset page</a>
                  </p>
                )}

                <button className="btn btn-primary" type="submit" disabled={authLoading}>
                  {authLoading ? 'Please wait...' : 'Send reset link'}
                </button>
              </form>

              <p className="login-foot">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setAuthMode('login')
                    setAuthError('')
                    setResetMessage('')
                    setResetLink('')
                  }}
                >
                  Back to sign in
                </button>
              </p>
            </>
          )}

          {authMode === 'reset' && (
            <>
              <form onSubmit={handleResetPassword}>
                <label htmlFor="reset-password">New password</label>
                <input
                  id="reset-password"
                  type="password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  maxLength={72}
                  required
                />

                {authError && <p className="history-error">{authError}</p>}

                <button className="btn btn-primary" type="submit" disabled={authLoading}>
                  {authLoading ? 'Please wait...' : 'Reset password'}
                </button>
              </form>

              <p className="login-foot">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setAuthMode('login')
                    setAuthError('')
                    setResetMessage('')
                    window.history.replaceState({}, '', '/')
                  }}
                >
                  Back to sign in
                </button>
              </p>
            </>
          )}

          {(authMode === 'login' || authMode === 'register') && (
            <>
              <form onSubmit={handleAuthSubmit}>
                {authMode === 'register' && (
                  <>
                    <label htmlFor="auth-name">Name</label>
                    <input
                      id="auth-name"
                      type="text"
                      value={authName}
                      onChange={(event) => setAuthName(event.target.value)}
                      placeholder="Your name"
                      required
                    />
                  </>
                )}

                <label htmlFor="auth-email">Email address</label>
                <input
                  id="auth-email"
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                />

                <label htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />

                {authMode === 'login' && (
                  <div className="login-row">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => {
                        setAuthMode('forgot')
                        setAuthError('')
                        setResetMessage('')
                        setResetLink('')
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {authError && <p className="history-error">{authError}</p>}

                <button className="btn btn-primary" type="submit" disabled={authLoading}>
                  {authLoading
                    ? 'Please wait...'
                    : authMode === 'login'
                      ? 'Sign in'
                      : 'Create account'}
                </button>
              </form>

              <p className="login-foot">
                {authMode === 'login'
                  ? "Don't have an account? "
                  : 'Already have an account? '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setAuthMode(authMode === 'login' ? 'register' : 'login')
                    setAuthError('')
                    setResetMessage('')
                  }}
                >
                  {authMode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------
  // LOGGED-IN APP
  // ---------------------------------------------------------------
  const userName = authUser?.name || authUser?.email || 'User'

  return (
    <div className="shell">
      <header className="nav">
        <div className="brand">
          <LeafLogo />
          <span>{APP_NAME}</span>
        </div>

        <nav className="tabs" aria-label="Main">
          <button
            type="button"
            className={activeView === 'calculator' ? 'tab active' : 'tab'}
            onClick={openCalculator}
          >
            Calculator
          </button>
          <button
            type="button"
            className={activeView === 'dashboard' ? 'tab active' : 'tab'}
            onClick={openDashboard}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={activeView === 'history' ? 'tab active' : 'tab'}
            onClick={openHistory}
          >
            History
          </button>
          <button
            type="button"
            className={activeView === 'assistant' ? 'tab active' : 'tab'}
            onClick={openAssistant}
          >
            Assistant
          </button>
        </nav>

        <div className="nav-user">
          <span className="nav-name">{userName}</span>
          <button type="button" className="btn-out" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="page">
        {/* ============ CALCULATOR ============ */}
        {activeView === 'calculator' && (
          <>
          <BudgetBanner
            percent={budgetPercentRaw}
            budget={budgetNumber}
            total={totalCO2}
            emailNotice={alertNotice}
          />
          <section className="calc">
            <div className="calc-form">
              <h2>Calculate your trip emissions</h2>
              <p className="lead">
                Choose a vehicle, describe the trip, and see the CO₂ it produced.
              </p>

              <div className="step">
                <div className="step-head">
                  <span className="step-num">1</span>
                  <h3>Choose your vehicle</h3>
                </div>

                <div className="grid-3">
                  <div>
                    <label htmlFor="vehicle-make">Make</label>
                    <select
                      id="vehicle-make"
                      value={vehicleMake}
                      onChange={(event) => {
                        setVehicleMake(event.target.value)
                        setVehicleModel('')
                        setModelYear('')
                        setEmissionResult(null)
                      }}
                      required
                    >
                      <option value="">Select make</option>
                      {[...new Set(backendVehicles.map((vehicle) => vehicle.make))].map(
                        (make) => (
                          <option key={make} value={make}>
                            {make}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="vehicle-model">Model</label>
                    <select
                      id="vehicle-model"
                      value={vehicleModel}
                      onChange={(event) => {
                        setVehicleModel(event.target.value)
                        setModelYear('')
                        setEmissionResult(null)
                      }}
                      required
                      disabled={!vehicleMake}
                    >
                      <option value="">Select model</option>
                      {[
                        ...new Set(
                          backendVehicles
                            .filter((vehicle) => vehicle.make === vehicleMake)
                            .map((vehicle) => vehicle.model)
                        )
                      ].map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="model-year">Year</label>
                    <select
                      id="model-year"
                      value={modelYear}
                      onChange={(event) => {
                        setModelYear(event.target.value)
                        setEmissionResult(null)
                      }}
                      required
                      disabled={!vehicleModel}
                    >
                      <option value="">Select year</option>
                      {backendVehicles
                        .filter(
                          (vehicle) =>
                            vehicle.make === vehicleMake &&
                            vehicle.model === vehicleModel
                        )
                        .map((vehicle) => vehicle.year)
                        .filter((year, index, years) => years.indexOf(year) === index)
                        .sort((a, b) => b - a)
                        .map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="step">
                <div className="step-head">
                  <span className="step-num">2</span>
                  <h3>Describe the trip</h3>
                </div>

                <div className="grid-2">
                  <div>
                    <label htmlFor="distance">Distance travelled (km)</label>
                    <input
                      id="distance"
                      type="number"
                      min="0.1"
                      step="any"
                      value={distanceTravelled}
                      onChange={(event) => setDistanceTravelled(event.target.value)}
                      placeholder="e.g. 42"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="mileage">Current mileage (km/litre)</label>
                    <input
                      id="mileage"
                      type="number"
                      min="0.1"
                      step="any"
                      value={currentMileage}
                      onChange={(event) => setCurrentMileage(event.target.value)}
                      placeholder="Blank = use reference mileage"
                    />
                  </div>
                </div>
              </div>

              <button type="button" className="btn btn-primary btn-big" onClick={calculateEmissions}>
                Calculate emissions
              </button>
            </div>

            <aside className="readout" aria-live="polite">
              <span className="readout-label">Estimated carbon emissions</span>

              <div className="readout-main">
                <span className="readout-number">
                  {emissionResult !== null ? emissionResult.toFixed(2) : '0.00'}
                </span>
                <span className="readout-unit">kg CO₂</span>
              </div>

              <div className="readout-foot emission-result">
                {emissionResult !== null && selectedVehicle ? (
                  <>
                    <strong>
                      {selectedVehicle.make} {selectedVehicle.model} ({selectedVehicle.year})
                    </strong>
                    {selectedVehicle.fuelType && <span>Fuel: {selectedVehicle.fuelType}</span>}
                    <span>Saved to your history</span>
                  </>
                ) : (
                  <span>Your result will appear here once you calculate.</span>
                )}
              </div>

              {emissionResult !== null && calcDetails && (
                <div className="source">
                  <h4>How this was calculated</h4>
                  <p>
                    Fuel used: {calcDetails.distance} km ÷ {calcDetails.mileage} km/L ={' '}
                    <strong>{calcDetails.fuelConsumed.toFixed(2)} L</strong>
                  </p>
                  <p>
                    CO₂: {calcDetails.fuelConsumed.toFixed(2)} L × {calcDetails.emissionFactor}{' '}
                    kg CO₂/L ({calcDetails.fuelType}) ={' '}
                    <strong>{emissionResult.toFixed(2)} kg</strong>
                  </p>
                  <p>Mileage: {calcDetails.mileageSource}.</p>
                  <p className="source-note">{DATA_SOURCES.vehicles}</p>
                  <p className="source-note">{DATA_SOURCES.factors}</p>
                </div>
              )}
            </aside>
          </section>
          </>
        )}

        {/* ============ DASHBOARD ============ */}
        {activeView === 'dashboard' && (
          <section className="dash">
            {historyLoading && <p className="muted">Loading dashboard...</p>}
            {historyError && <p className="history-error">{historyError}</p>}

            <BudgetBanner
              percent={budgetPercentRaw}
              budget={budgetNumber}
              total={totalCO2}
              emailNotice={alertNotice}
            />

            <div className="hero">
              <div>
                <span className="hero-label">Total CO₂ emitted</span>
                <div className="hero-number">
                  {totalCO2.toFixed(2)} <small>kg</small>
                </div>
              </div>

              <div className="budget">
                <div className="budget-top">
                  <span>{budgetPercent}% of your budget used</span>
                  <span className="budget-edit">Budget: {budgetNumber} kg</span>
                </div>
                <div className="budget-track">
                  <div className="budget-fill" style={{ width: `${budgetPercent}%` }} />
                </div>
              </div>
            </div>

            <TrackingPanel
              period={trackPeriod}
              onPeriodChange={setTrackPeriod}
              summary={trackSummary}
              loading={trackLoading}
              error={trackError}
            />

            <form className="panel settings" onSubmit={saveSettings}>
              <h3>Budget and email alerts</h3>

              <div className="grid-2">
                <div>
                  <label htmlFor="budget">Carbon budget (kg CO₂)</label>
                  <input
                    id="budget"
                    type="number"
                    min="1"
                    step="any"
                    value={budgetInput}
                    onChange={(event) => setBudgetInput(event.target.value)}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="alert-email">Alert email</label>
                  <input
                    id="alert-email"
                    type="email"
                    value={alertEmail}
                    onChange={(event) => setAlertEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>
              </div>

              <label className="check-row" htmlFor="alerts-on">
                <input
                  id="alerts-on"
                  type="checkbox"
                  checked={alertsEnabled}
                  onChange={(event) => setAlertsEnabled(event.target.checked)}
                />
                Email me when I reach 80%, 90% and 100% of my budget
              </label>

              {!emailConfigured && (
                <p className="muted settings-note">
                  Email sending is not set up on the server yet. You will still
                  see the warning banner in the app.
                </p>
              )}

              {settingsError && <p className="history-error">{settingsError}</p>}
              {settingsMessage && <p className="notice">{settingsMessage}</p>}

              <div className="settings-actions">
                <button className="btn btn-primary" type="submit" disabled={settingsSaving}>
                  {settingsSaving ? 'Saving...' : 'Save settings'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={sendTestEmail}
                  disabled={!emailConfigured || !alertEmail.trim()}
                >
                  Send test email
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={sendSummaryEmail}
                  disabled={!emailConfigured || !alertEmail.trim()}
                >
                  Email my current total
                </button>
              </div>
            </form>

            <div className="metrics">
              <div>
                <span className="metric-value">{totalCalculations}</span>
                <span className="metric-label">Calculations</span>
              </div>
              <div>
                <span className="metric-value">{totalDistance.toFixed(1)}</span>
                <span className="metric-label">Kilometres travelled</span>
              </div>
              <div>
                <span className="metric-value">{totalFuel.toFixed(1)}</span>
                <span className="metric-label">Litres of fuel</span>
              </div>
            </div>

            <div className="dash-two">
              <div className="panel">
                <h3>Emissions per calculation</h3>
                {trendRecords.length === 0 ? (
                  <p className="muted">No calculations yet. Use the calculator to add one.</p>
                ) : (
                  <div className="trend">
                    {trendRecords.map((record, index) => {
                      const value = Number(record.co2Kg || 0)
                      return (
                        <div className="trend-col" key={record.id ?? index}>
                          <span className="trend-value">{value.toFixed(1)}</span>
                          <div
                            className="trend-bar"
                            style={{ height: `${Math.max((value / trendMax) * 100, 3)}%` }}
                          />
                          <span className="trend-label">{record.vehicleMake}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="panel">
                <h3>Highest-emitting vehicles</h3>
                {topVehicles.length === 0 ? (
                  <p className="muted">No data yet.</p>
                ) : (
                  <ol className="rank">
                    {topVehicles.map(([name, value]) => (
                      <li key={name}>
                        <div className="rank-top">
                          <span>{name}</span>
                          <strong>{value.toFixed(1)} kg</strong>
                        </div>
                        <div className="rank-track">
                          <div
                            className="rank-fill"
                            style={{ width: `${(value / topVehicleMax) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <div className="panel">
              <h3>Recent calculations</h3>
              {historyRecords.length === 0 ? (
                <p className="muted">Nothing here yet.</p>
              ) : (
                <ul className="recent">
                  {historyRecords.slice(0, 5).map((record, index) => (
                    <li key={record.id ?? index}>
                      <span className="recent-name">
                        {record.vehicleMake} {record.vehicleModel}
                        <small>{Number(record.distanceKm).toFixed(1)} km</small>
                      </span>
                      <span className="recent-co2">{Number(record.co2Kg).toFixed(2)} kg</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* ============ HISTORY ============ */}
        {activeView === 'history' && (
          <section className="hist">
            <div className="hist-head">
              <div>
                <h2>Calculation history</h2>
                <p className="lead">Every calculation you have saved.</p>
              </div>

              {historyRecords.length > 0 && (
                <button type="button" className="btn btn-danger" onClick={clearHistory}>
                  Clear all
                </button>
              )}
            </div>

            {historyLoading && <p className="muted">Loading history...</p>}
            {historyError && <p className="history-error">{historyError}</p>}

            {!historyLoading && !historyError && historyRecords.length === 0 && (
              <div className="panel empty">
                <p>No calculation history found.</p>
                <button type="button" className="btn btn-primary" onClick={openCalculator}>
                  Calculate emissions
                </button>
              </div>
            )}

            {historyRecords.length > 0 && (
              <div className="panel table-panel">
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Vehicle</th>
                        <th>Distance</th>
                        <th>Fuel consumed</th>
                        <th>CO₂ emitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRecords.map((record, index) => (
                        <tr key={record.id ?? index} className="history-item">
                          <td>
                            <strong>
                              {record.vehicleMake} {record.vehicleModel}
                            </strong>
                            <span className="muted"> ({record.modelYear})</span>
                          </td>
                          <td>{record.distanceKm} km</td>
                          <td>{record.fuelConsumedLitres} litres</td>
                          <td className="co2-cell">{record.co2Kg} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============ ASSISTANT ============ */}
        {activeView === 'assistant' && (
          <section className="assistant">
            <div className="chat-shell">
              <div className="chat-head">
                <div className="chat-avatar">
                  <LeafLogo />
                </div>
                <div>
                  <h2>Carbon assistant</h2>
                  <span className="chat-status">
                    <i /> Online, ask about emissions
                  </span>
                </div>
                {assistantMessages.length > 0 && (
                  <button
                    type="button"
                    className="chat-clear"
                    onClick={() => {
                      setAssistantMessages([])
                      setAssistantError('')
                    }}
                  >
                    New chat
                  </button>
                )}
              </div>

              <div className="chat-log" aria-live="polite">
                {assistantMessages.length === 0 && (
                  <div className="chat-empty">
                    <h3>How can I help you today?</h3>
                    <p className="muted">Pick a question or type your own below.</p>
                    <div className="suggest-grid">
                      {SUGGESTIONS.map(([icon, prompt]) => (
                        <button
                          key={prompt}
                          type="button"
                          className="suggest-card"
                          onClick={() => sendAssistantMessage(prompt)}
                        >
                          <span className="suggest-icon">{icon}</span>
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {assistantMessages.map((message, index) => (
                  <div key={index} className={`msg ${message.role}`}>
                    {message.role === 'assistant' && (
                      <div className="msg-avatar">
                        <LeafLogo />
                      </div>
                    )}
                    <div className={`bubble ${message.role}`}>{message.content}</div>
                  </div>
                ))}

                {assistantLoading && (
                  <div className="msg assistant">
                    <div className="msg-avatar">
                      <LeafLogo />
                    </div>
                    <div className="bubble assistant typing" aria-label="Assistant is typing">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {assistantError && <p className="history-error">{assistantError}</p>}

              <form
                className="chat-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  sendAssistantMessage()
                }}
              >
                <input
                  type="text"
                  value={assistantInput}
                  onChange={(event) => setAssistantInput(event.target.value)}
                  placeholder="Ask something about your emissions..."
                  maxLength={1000}
                  aria-label="Message the assistant"
                />
                <button
                  className="send-btn"
                  type="submit"
                  disabled={assistantLoading}
                  aria-label="Send message"
                >
                  ➤
                </button>
              </form>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
