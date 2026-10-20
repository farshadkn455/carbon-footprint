const fs = require('fs')
const Database = require('better-sqlite3')
const express = require('express')
const { GoogleGenAI } = require('@google/genai')
const cors = require('cors')
require('dotenv').config()

const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const nodemailer = require('nodemailer')

const db = new Database('ecotrack.db')
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    fuelType TEXT NOT NULL,
    engineType TEXT NOT NULL,
    engineCC REAL,
    emissionStandard TEXT,
    testCycle TEXT,
    methodology TEXT,
    fuelEconomy REAL,
    fuelEconomyUnit TEXT,
    fuelEconomySource TEXT,
    source TEXT

    )
`)

// Password reset tokens
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    email TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )
`)

const vehicleColumns = db.prepare(
  'PRAGMA table_info(vehicles)'
).all()

const columnNames = vehicleColumns.map((column) => column.name)

if (!columnNames.includes('testCycle')) {
  db.exec('ALTER TABLE vehicles ADD COLUMN testCycle TEXT')
}

if (!columnNames.includes('methodology')) {
  db.exec('ALTER TABLE vehicles ADD COLUMN methodology TEXT')
}

if (!columnNames.includes('source')) {
  db.exec('ALTER TABLE vehicles ADD COLUMN source TEXT')
}

if (!columnNames.includes('generation')) {
  db.exec('ALTER TABLE vehicles ADD COLUMN generation TEXT')
}

if (!columnNames.includes('variant')) {
  db.exec('ALTER TABLE vehicles ADD COLUMN variant TEXT')
}

if (!columnNames.includes('fuelEconomyType')) {
  db.exec('ALTER TABLE vehicles ADD COLUMN fuelEconomyType TEXT')
}

if (!columnNames.includes('fuelEconomySource')) {
  db.exec('ALTER TABLE vehicles ADD COLUMN fuelEconomySource TEXT')
}

if (!columnNames.includes('sourceUrl')) {
  db.exec('ALTER TABLE vehicles ADD COLUMN sourceUrl TEXT')
}

const { parse } = require('csv-parse/sync')

const csv = fs.readFileSync('vehicle_data.csv', 'utf8')

const records = parse(csv, {
  columns: (header) => header.map((name) => name.trim()),
  skip_empty_lines: true,
  bom: true,
  trim: true,
  relax_column_count: false
})

const requiredColumns = [
  'make',
  'model',
  'year',
  'generation',
  'variant',
  'fuelType',
  'engineType',
  'engineCC',
  'emissionStandard',
  'testCycle',
  'methodology',
  'fuelEconomy',
  'fuelEconomyUnit',
  'fuelEconomyType',
  'fuelEconomySource',
  'source',
  'sourceUrl'
]

const csvColumns = records.length > 0 ? Object.keys(records[0]) : []

const missingColumns = requiredColumns.filter(
  (column) => !csvColumns.includes(column)
)

if (missingColumns.length > 0) {
  throw new Error(
    `CSV is missing required columns: ${missingColumns.join(', ')}`
  )
}

function textOrNull(value) {
  const cleaned = String(value ?? '').trim()
  return cleaned === '' ? null : cleaned
}

function numberOrNull(value) {
  const cleaned = String(value ?? '').trim()

  if (cleaned === '') return null

  const number = Number(cleaned)

  if (!Number.isFinite(number)) {
    throw new Error(`Invalid numeric value in CSV: "${value}"`)
  }

  return number
}

const insertVehicle = db.prepare(`
  INSERT INTO vehicles (
    make,
    model,
    year,
    generation,
    variant,
    fuelType,
    engineType,
    engineCC,
    emissionStandard,
    testCycle,
    methodology,
    fuelEconomy,
    fuelEconomyUnit,
    fuelEconomyType,
    fuelEconomySource,
    source,
    sourceUrl
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const importVehicles = db.transaction(() => {
  db.prepare('DELETE FROM vehicles').run()

  for (const row of records) {
    insertVehicle.run(
      textOrNull(row.make),
      textOrNull(row.model),
      numberOrNull(row.year),
      textOrNull(row.generation),
      textOrNull(row.variant),
      textOrNull(row.fuelType),
      textOrNull(row.engineType),
      numberOrNull(row.engineCC),
      textOrNull(row.emissionStandard),
      textOrNull(row.testCycle),
      textOrNull(row.methodology),
      numberOrNull(row.fuelEconomy),
      textOrNull(row.fuelEconomyUnit),
      textOrNull(row.fuelEconomyType),
      textOrNull(row.fuelEconomySource),
      textOrNull(row.source),
      textOrNull(row.sourceUrl)
    )
  }
})

importVehicles()

console.log(`Imported ${records.length} vehicles from CSV.`)

db.exec(`
  CREATE TABLE IF NOT EXISTS emission_factors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fuelType TEXT NOT NULL,
    vehicleType TEXT NOT NULL,
    factor REAL NOT NULL,
    unit TEXT NOT NULL,
    source TEXT
  )
`)

const existingPetrolFactor = db.prepare(`
  SELECT id
  FROM emission_factors
  WHERE fuelType = ? AND vehicleType = ?
`).get('Petrol', '2-Wheeler')

if (existingPetrolFactor) {
  db.prepare(`
    UPDATE emission_factors
    SET factor = ?, unit = ?, source = ?
    WHERE id = ?
  `).run(
    2.272,
    'kg CO2 per litre',
    'India Specific Road Transport Emission Factors (2015) - provisional approximate value',
    existingPetrolFactor.id
  )
} else {
  db.prepare(`
    INSERT INTO emission_factors (
      fuelType,
      vehicleType,
      factor,
      unit,
      source
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'Petrol',
    '2-Wheeler',
    2.272,
    'kg CO2 per litre',
    'India Specific Road Transport Emission Factors (2015) - provisional approximate value'
  )
}

db.exec(`
  CREATE TABLE IF NOT EXISTS calculation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicleMake TEXT NOT NULL,
    vehicleModel TEXT NOT NULL,
    modelYear INTEGER NOT NULL,
    distanceKm REAL NOT NULL,
    mileageKmPerLitre REAL NOT NULL,
    fuelConsumedLitres REAL NOT NULL,
    emissionFactor REAL NOT NULL,
    co2Kg REAL NOT NULL,
    calculatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

// Users table for registration and login
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    passwordHash TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`)

// Budget and alert settings on the users table
const userColumnNames = db
  .prepare('PRAGMA table_info(users)')
  .all()
  .map((column) => column.name)

if (!userColumnNames.includes('carbonBudget')) {
  db.exec('ALTER TABLE users ADD COLUMN carbonBudget REAL NOT NULL DEFAULT 500')
}

if (!userColumnNames.includes('alertEmail')) {
  db.exec('ALTER TABLE users ADD COLUMN alertEmail TEXT')
}

if (!userColumnNames.includes('alertsEnabled')) {
  db.exec('ALTER TABLE users ADD COLUMN alertsEnabled INTEGER NOT NULL DEFAULT 0')
}

// 0 = no alert sent, otherwise the last level emailed: 80, 90 or 100
if (!userColumnNames.includes('lastAlertLevel')) {
  db.exec('ALTER TABLE users ADD COLUMN lastAlertLevel INTEGER NOT NULL DEFAULT 0')
}

// Add userId to history so calculations can belong to users
const historyColumns = db.prepare(
  'PRAGMA table_info(calculation_history)'
).all()

const historyColumnNames = historyColumns.map((column) => column.name)

if (!historyColumnNames.includes('userId')) {
  db.exec('ALTER TABLE calculation_history ADD COLUMN userId INTEGER')
}

const app = express()
app.use(cors())
app.use(express.json())

// Require a JWT secret in the backend .env file
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is missing. Check your backend .env file.')
}

const JWT_SECRET = process.env.JWT_SECRET

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

// Middleware to protect routes that require login
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Please log in to continue.'
    })
  }

  const token = authHeader.slice(7)

  try {
    const decoded = jwt.verify(token, JWT_SECRET)

    req.user = {
      id: decoded.userId,
      email: decoded.email
    }

    next()
  } catch (error) {
    return res.status(401).json({
      error: 'Your session is invalid or expired. Please log in again.'
    })
  }
}

// ---------------------------------------------------------------
// Email alerts (Gmail SMTP through Nodemailer)
// Needs GMAIL_USER and GMAIL_APP_PASSWORD in the backend .env file.
// ---------------------------------------------------------------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const mailer =
  process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      })
    : null

if (!mailer) {
  console.log(
    'Email alerts are off: set GMAIL_USER and GMAIL_APP_PASSWORD in .env to turn them on.'
  )
}

function levelFor(percent) {
  if (percent >= 100) return 100
  if (percent >= 90) return 90
  if (percent >= 80) return 80
  return 0
}

function getBudgetStatus(userId) {
  const user = db.prepare(`
    SELECT name, carbonBudget, alertEmail, alertsEnabled, lastAlertLevel
    FROM users
    WHERE id = ?
  `).get(userId)

  if (!user) return null

  const totals = db.prepare(`
    SELECT COALESCE(SUM(co2Kg), 0) AS totalCO2
    FROM calculation_history
    WHERE userId = ?
  `).get(userId)

  const budget = Number(user.carbonBudget) > 0 ? Number(user.carbonBudget) : 500
  const totalCO2 = Number(totals.totalCO2)
  const percent = (totalCO2 / budget) * 100

  return { user, budget, totalCO2, percent, level: levelFor(percent) }
}

async function sendBudgetAlertEmail({ to, name, level, percent, totalCO2, budget }) {
  if (!mailer) {
    console.log('Alert skipped: email is not configured.')
    return false
  }

  const heading =
    level >= 100
      ? 'You have used your whole carbon budget'
      : `You have used ${level}% of your carbon budget`

  // Plain text only, so nothing a user typed can be turned into markup.
  const text = [
    `Hi ${name || 'there'},`,
    '',
    heading + '.',
    '',
    `Total CO2 so far: ${totalCO2.toFixed(2)} kg`,
    `Your budget: ${budget} kg`,
    `Used: ${Math.round(percent)}%`,
    '',
    'You can change your budget or turn these emails off from the Dashboard.',
    '',
    'Carbon Footprint'
  ].join('\n')

  await mailer.sendMail({
    from: `"Carbon Footprint" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Carbon Footprint: ${heading.toLowerCase()}`,
    text
  })

  return true
}

// Sends one email each time a user crosses 80%, 90% or 100% of their budget.
async function checkBudgetAlert(userId) {
  const status = getBudgetStatus(userId)

  if (!status) return null

  const { user, budget, totalCO2, percent, level } = status
  const result = {
    percent: Math.round(percent),
    level,
    budget,
    totalCO2,
    emailSent: false
  }

  // Budget went up or history changed: allow future alerts again.
  if (level < user.lastAlertLevel) {
    db.prepare('UPDATE users SET lastAlertLevel = ? WHERE id = ?').run(level, userId)
    return result
  }

  if (level > user.lastAlertLevel) {
    if (user.alertsEnabled && user.alertEmail) {
      try {
        const sent = await sendBudgetAlertEmail({
          to: user.alertEmail,
          name: user.name,
          level,
          percent,
          totalCO2,
          budget
        })

        if (sent) {
          db.prepare('UPDATE users SET lastAlertLevel = ? WHERE id = ?').run(
            level,
            userId
          )
          result.emailSent = true
        }
      } catch (error) {
        console.error('Could not send alert email:', String(error.message || error))
      }
    }
  }

  return result
}

// REGISTER
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body

  const cleanedName = String(name || '').trim()
  const cleanedEmail = String(email || '').trim().toLowerCase()

  if (!cleanedName || !cleanedEmail || !password) {
    return res.status(400).json({
      error: 'Name, email, and password are required.'
    })
  }

  if (cleanedName.length > 100) {
    return res.status(400).json({
      error: 'Name must be 100 characters or fewer.'
    })
  }

  if (cleanedEmail.length > 254 || !EMAIL_PATTERN.test(cleanedEmail)) {
    return res.status(400).json({
      error: 'Please enter a valid email address.'
    })
  }

  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 72
  ) {
    return res.status(400).json({
      error: 'Password must be between 8 and 72 characters.'
    })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12)

    const result = db.prepare(`
      INSERT INTO users (name, email, passwordHash)
      VALUES (?, ?, ?)
    `).run(cleanedName, cleanedEmail, passwordHash)

    const user = {
      id: Number(result.lastInsertRowid),
      name: cleanedName,
      email: cleanedEmail
    }

    return res.status(201).json({
      message: 'Account created successfully.',
      token: createToken(user),
      user
    })
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({
        error: 'An account with this email already exists.'
      })
    }

    console.error('Registration error:', error)

    return res.status(500).json({
      error: 'Could not create your account.'
    })
  }
})

// LOGIN
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body

  const cleanedEmail = String(email || '').trim().toLowerCase()

  if (!cleanedEmail || typeof password !== 'string' || !password) {
    return res.status(400).json({
      error: 'Email and password are required.'
    })
  }

  try {
    const user = db.prepare(`
      SELECT id, name, email, passwordHash
      FROM users
      WHERE email = ?
    `).get(cleanedEmail)

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      })
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    )

    if (!passwordMatches) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      })
    }

    return res.json({
      message: 'Login successful.',
      token: createToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    })
  } catch (error) {
    console.error('Login error:', error)

    return res.status(500).json({
      error: 'Could not log in.'
    })
  }
})

// GET CURRENT USER
app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, email, createdAt
    FROM users
    WHERE id = ?
  `).get(req.user.id)

  if (!user) {
    return res.status(404).json({
      error: 'User account not found.'
    })
  }

  res.json({ user })
})

app.get('/', (req, res) => {
  res.send('Carbon Footprint backend is running!')
})

app.get('/api/vehicles', (req, res) => {
  const vehicles = db.prepare('SELECT * FROM vehicles').all()
  res.json(vehicles)
})

app.get('/api/emission-factors', (req, res) => {
  const factors = db.prepare('SELECT * FROM emission_factors').all()
  res.json(factors)
})

// ---------------------------------------------------------------
// Budget and alert settings
// ---------------------------------------------------------------

app.get('/api/settings', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT carbonBudget, alertEmail, alertsEnabled
    FROM users
    WHERE id = ?
  `).get(req.user.id)

  if (!user) {
    return res.status(404).json({ error: 'User account not found.' })
  }

  res.json({
    carbonBudget: Number(user.carbonBudget),
    alertEmail: user.alertEmail || '',
    alertsEnabled: Boolean(user.alertsEnabled),
    emailConfigured: Boolean(mailer)
  })
})

app.put('/api/settings', requireAuth, (req, res) => {
  const budget = Number(req.body.carbonBudget)
  const alertsEnabled = Boolean(req.body.alertsEnabled)
  const alertEmail = String(req.body.alertEmail || '').trim().toLowerCase()

  if (!Number.isFinite(budget) || budget <= 0 || budget > 10000000) {
    return res.status(400).json({
      error: 'Budget must be a number greater than 0.'
    })
  }

  if (alertEmail && (alertEmail.length > 254 || !EMAIL_PATTERN.test(alertEmail))) {
    return res.status(400).json({
      error: 'Please enter a valid alert email address.'
    })
  }

  if (alertsEnabled && !alertEmail) {
    return res.status(400).json({
      error: 'Add an email address to turn alerts on.'
    })
  }

  try {
    db.prepare(`
      UPDATE users
      SET carbonBudget = ?, alertEmail = ?, alertsEnabled = ?
      WHERE id = ?
    `).run(budget, alertEmail || null, alertsEnabled ? 1 : 0, req.user.id)

    // Start from the current level, so saving settings never sends an old alert.
    const status = getBudgetStatus(req.user.id)

    db.prepare('UPDATE users SET lastAlertLevel = ? WHERE id = ?').run(
      status ? status.level : 0,
      req.user.id
    )

    res.json({
      message: 'Settings saved.',
      carbonBudget: budget,
      alertEmail,
      alertsEnabled,
      emailConfigured: Boolean(mailer)
    })
  } catch (error) {
    console.error('Error saving settings:', error)
    res.status(500).json({ error: 'Could not save settings.' })
  }
})

// Sends a test email so a user can confirm alerts reach them.
app.post('/api/settings/test-email', requireAuth, async (req, res) => {
  if (!mailer) {
    return res.status(503).json({
      error: 'Email is not configured on the server.'
    })
  }

  const user = db.prepare(`
    SELECT name, alertEmail
    FROM users
    WHERE id = ?
  `).get(req.user.id)

  if (!user || !user.alertEmail) {
    return res.status(400).json({
      error: 'Save an alert email first.'
    })
  }

  try {
    await mailer.sendMail({
      from: `"Carbon Footprint" <${process.env.GMAIL_USER}>`,
      to: user.alertEmail,
      subject: 'Carbon Footprint: test alert',
      text: `Hi ${user.name || 'there'},\n\nThis is a test. Your budget alerts will arrive at this address.\n\nCarbon Footprint`
    })

    res.json({ message: `Test email sent to ${user.alertEmail}.` })
  } catch (error) {
    console.error('Test email error:', String(error.message || error))
    res.status(502).json({
      error: 'Could not send the test email. Check the Gmail settings in .env.'
    })
  }
})

// Emails the user's current total emissions on demand.
const lastSummaryAt = new Map()

app.post('/api/settings/send-summary', requireAuth, async (req, res) => {
  if (!mailer) {
    return res.status(503).json({
      error: 'Email is not configured on the server.'
    })
  }

  // One summary per minute per user, so the button cannot be used to spam.
  const now = Date.now()
  const last = lastSummaryAt.get(req.user.id) || 0

  if (now - last < 60 * 1000) {
    return res.status(429).json({
      error: 'Please wait a minute before sending another summary.'
    })
  }

  const status = getBudgetStatus(req.user.id)

  if (!status || !status.user.alertEmail) {
    return res.status(400).json({
      error: 'Save an alert email first.'
    })
  }

  const { user, budget, totalCO2, percent } = status

  const count = db.prepare(`
    SELECT COUNT(*) AS total
    FROM calculation_history
    WHERE userId = ?
  `).get(req.user.id).total

  try {
    await mailer.sendMail({
      from: `"Carbon Footprint" <${process.env.GMAIL_USER}>`,
      to: user.alertEmail,
      subject: 'Carbon Footprint: your current total emissions',
      text: [
        `Hi ${user.name || 'there'},`,
        '',
        'Here is your current total.',
        '',
        `Total CO2 so far: ${totalCO2.toFixed(2)} kg`,
        `Saved calculations: ${count}`,
        `Your budget: ${budget} kg`,
        `Used: ${Math.round(percent)}%`,
        '',
        'Carbon Footprint'
      ].join('\n')
    })

    lastSummaryAt.set(req.user.id, now)

    res.json({ message: `Summary sent to ${user.alertEmail}.` })
  } catch (error) {
    console.error('Summary email error:', String(error.message || error))
    res.status(502).json({
      error: 'Could not send the summary. Check the Gmail settings in .env.'
    })
  }
})

app.post('/api/history', requireAuth, async (req, res) => {
  const {
    vehicleMake,
    vehicleModel,
    modelYear,
    distanceKm,
    mileageKmPerLitre,
    fuelConsumedLitres,
    emissionFactor,
    co2Kg
  } = req.body

  const values = [
    distanceKm,
    mileageKmPerLitre,
    fuelConsumedLitres,
    emissionFactor,
    co2Kg
  ]

  if (
    !vehicleMake ||
    !vehicleModel ||
    !Number.isInteger(Number(modelYear)) ||
    values.some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)
  ) {
    return res.status(400).json({
      error: 'Please provide valid calculation details.'
    })
  }

  try {
    const result = db.prepare(`
      INSERT INTO calculation_history (
        userId,
        vehicleMake,
        vehicleModel,
        modelYear,
        distanceKm,
        mileageKmPerLitre,
        fuelConsumedLitres,
        emissionFactor,
        co2Kg
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      vehicleMake,
      vehicleModel,
      Number(modelYear),
      Number(distanceKm),
      Number(mileageKmPerLitre),
      Number(fuelConsumedLitres),
      Number(emissionFactor),
      Number(co2Kg)
    )

    // The calculation is saved, so a failed alert must never fail the request.
    let alert = null

    try {
      alert = await checkBudgetAlert(req.user.id)
    } catch (alertError) {
      console.error('Budget alert check failed:', alertError)
    }

    res.status(201).json({
      message: 'Calculation saved successfully.',
      id: result.lastInsertRowid,
      alert
    })
  } catch (error) {
    console.error('Error saving calculation:', error)
    res.status(500).json({
      error: 'Failed to save calculation.'
    })
  }
})

app.get('/api/history', requireAuth, (req, res) => {
  try {
    const history = db.prepare(`
      SELECT *
      FROM calculation_history
      WHERE userId = ?
      ORDER BY calculatedAt DESC, id DESC
    `).all(req.user.id)

    res.json(history)
  } catch (error) {
    console.error('Error fetching calculation history:', error)
    res.status(500).json({
      error: 'Failed to fetch calculation history.'
    })
  }
})

// ---------------------------------------------------------------
// Emission tracking by day, week, month and year
//
// Reads the calculatedAt column that calculation_history already has.
// ---------------------------------------------------------------

const TRACK_PERIODS = {
  day: { buckets: 7, title: 'Today' }, // trend: last 7 days
  week: { buckets: 8, title: 'This week' }, // trend: last 8 weeks (Monday to Sunday)
  month: { buckets: 12, title: 'This month' }, // trend: last 12 months
  year: { buckets: 5, title: 'This year' } // trend: last 5 years
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// SQLite's CURRENT_TIMESTAMP is stored in UTC ("2026-10-20 14:05:00").
// Dates are shifted by the browser's UTC offset first, then read with the
// getUTC* methods, so a trip taken at 1 a.m. in India counts as that day
// in India and not as the previous day in UTC.
function parseSavedTime(value) {
  const text = String(value || '').trim()
  if (!text) return null

  const iso = text.includes('T') ? text : text.replace(' ', 'T')
  const hasZone = /(Z|[+-]\d{2}:\d{2})$/i.test(iso)
  const date = new Date(hasZone ? iso : iso + 'Z')

  return Number.isNaN(date.getTime()) ? null : date
}

function startOfPeriod(localDate, period) {
  const y = localDate.getUTCFullYear()
  const m = localDate.getUTCMonth()
  const d = localDate.getUTCDate()

  if (period === 'day') return new Date(Date.UTC(y, m, d))

  if (period === 'week') {
    const sinceMonday = (localDate.getUTCDay() + 6) % 7
    return new Date(Date.UTC(y, m, d - sinceMonday))
  }

  if (period === 'month') return new Date(Date.UTC(y, m, 1))

  return new Date(Date.UTC(y, 0, 1))
}

function shiftPeriod(start, period, count) {
  const y = start.getUTCFullYear()
  const m = start.getUTCMonth()
  const d = start.getUTCDate()

  if (period === 'day') return new Date(Date.UTC(y, m, d + count))
  if (period === 'week') return new Date(Date.UTC(y, m, d + 7 * count))
  if (period === 'month') return new Date(Date.UTC(y, m + count, 1))

  return new Date(Date.UTC(y + count, 0, 1))
}

// The first day of a period, as YYYY-MM-DD, is a unique key for that period.
function periodKey(start) {
  return start.toISOString().slice(0, 10)
}

function periodLabel(start, period) {
  const d = start.getUTCDate()
  const month = SHORT_MONTHS[start.getUTCMonth()]
  const year = start.getUTCFullYear()

  if (period === 'day') return `${SHORT_DAYS[start.getUTCDay()]} ${d}`
  if (period === 'week') return `${d} ${month}`
  if (period === 'month') return `${month} '${String(year).slice(2)}`

  return String(year)
}

function periodRangeText(start, period) {
  const d = start.getUTCDate()
  const m = start.getUTCMonth()
  const y = start.getUTCFullYear()

  if (period === 'day') return `${SHORT_DAYS[start.getUTCDay()]}, ${d} ${LONG_MONTHS[m]} ${y}`

  if (period === 'week') {
    const end = new Date(Date.UTC(y, m, d + 6))
    return (
      `${d} ${SHORT_MONTHS[m]} \u2013 ` +
      `${end.getUTCDate()} ${SHORT_MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`
    )
  }

  if (period === 'month') return `${LONG_MONTHS[m]} ${y}`

  return String(y)
}

function roundTo(value, places = 3) {
  const factor = 10 ** places
  return Math.round((Number(value) || 0) * factor) / factor
}

// Pure function (no database access) so it is easy to test.
function buildTrackingSummary(rows, period, tzMinutes, now = new Date()) {
  const config = TRACK_PERIODS[period]
  const currentStart = startOfPeriod(new Date(now.getTime() + tzMinutes * 60000), period)
  const currentKey = periodKey(currentStart)

  // One bar per period, oldest first, so empty periods still show as zero.
  const trend = []

  for (let back = config.buckets - 1; back >= 0; back--) {
    const start = shiftPeriod(currentStart, period, -back)

    trend.push({
      key: periodKey(start),
      label: periodLabel(start, period),
      co2Kg: 0,
      calculations: 0,
      isCurrent: back === 0
    })
  }

  const trendByKey = new Map(trend.map((bucket) => [bucket.key, bucket]))
  const totals = { co2Kg: 0, distanceKm: 0, fuelLitres: 0, calculations: 0 }
  const vehicleMap = new Map()

  for (const row of rows) {
    const savedAt = parseSavedTime(row.calculatedAt)
    if (!savedAt) continue

    const start = startOfPeriod(new Date(savedAt.getTime() + tzMinutes * 60000), period)
    const key = periodKey(start)

    const co2 = Number(row.co2Kg) || 0
    const distance = Number(row.distanceKm) || 0
    const fuel = Number(row.fuelConsumedLitres) || 0

    const bucket = trendByKey.get(key)

    if (bucket) {
      bucket.co2Kg += co2
      bucket.calculations += 1
    }

    // Totals and the vehicle breakdown cover the current period only.
    if (key !== currentKey) continue

    totals.co2Kg += co2
    totals.distanceKm += distance
    totals.fuelLitres += fuel
    totals.calculations += 1

    const name = `${row.vehicleMake} ${row.vehicleModel} (${row.modelYear})`
    const entry = vehicleMap.get(name) || { name, co2Kg: 0, distanceKm: 0, calculations: 0 }

    entry.co2Kg += co2
    entry.distanceKm += distance
    entry.calculations += 1
    vehicleMap.set(name, entry)
  }

  const previousBucket = trend[trend.length - 2]

  return {
    period,
    periodTitle: config.title,
    rangeText: periodRangeText(currentStart, period),
    totals: {
      co2Kg: roundTo(totals.co2Kg),
      distanceKm: roundTo(totals.distanceKm),
      fuelLitres: roundTo(totals.fuelLitres),
      calculations: totals.calculations
    },
    previousCo2Kg: roundTo(previousBucket ? previousBucket.co2Kg : 0),
    trend: trend.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      co2Kg: roundTo(bucket.co2Kg),
      calculations: bucket.calculations,
      isCurrent: bucket.isCurrent
    })),
    vehicles: [...vehicleMap.values()]
      .map((entry) => ({
        name: entry.name,
        co2Kg: roundTo(entry.co2Kg),
        distanceKm: roundTo(entry.distanceKm),
        calculations: entry.calculations
      }))
      .sort((a, b) => b.co2Kg - a.co2Kg)
  }
}

// GET /api/history/summary?period=day|week|month|year&tz=330
// tz is the browser's UTC offset in minutes (India is 330).
app.get('/api/history/summary', requireAuth, (req, res) => {
  const period = String(req.query.period || 'week')

  if (!TRACK_PERIODS[period]) {
    return res.status(400).json({
      error: 'Period must be day, week, month or year.'
    })
  }

  let tzMinutes = Number(req.query.tz ?? 0)

  if (!Number.isInteger(tzMinutes) || Math.abs(tzMinutes) > 14 * 60) {
    tzMinutes = 0
  }

  try {
    const rows = db.prepare(`
      SELECT vehicleMake, vehicleModel, modelYear,
             distanceKm, fuelConsumedLitres, co2Kg, calculatedAt
      FROM calculation_history
      WHERE userId = ?
    `).all(req.user.id)

    res.json(buildTrackingSummary(rows, period, tzMinutes))
  } catch (error) {
    console.error('Error building tracking summary:', error)
    res.status(500).json({
      error: 'Failed to load emission tracking.'
    })
  }
})

// Deletes all of the logged-in user's saved calculations.
app.delete('/api/history', requireAuth, (req, res) => {
  try {
    const result = db.prepare(`
      DELETE FROM calculation_history
      WHERE userId = ?
    `).run(req.user.id)

    // Totals are back to zero, so budget alerts can fire again.
    db.prepare('UPDATE users SET lastAlertLevel = 0 WHERE id = ?').run(req.user.id)

    res.json({
      message: 'All calculations cleared.',
      deleted: result.changes
    })
  } catch (error) {
    console.error('Error clearing history:', error)
    res.status(500).json({
      error: 'Failed to clear calculation history.'
    })
  }
})

app.post('/api/auth/forgot-password', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase()

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' })
  }

  try {
    const user = db.prepare(
      'SELECT id, email FROM users WHERE email = ?'
    ).get(email)

    if (!user) {
      return res.json({
        message: 'If the account exists, a reset link has been generated.'
      })
    }

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = Date.now() + 30 * 60 * 1000

    db.prepare(`
      INSERT OR REPLACE INTO password_resets
      (email, token_hash, expires_at)
      VALUES (?, ?, ?)
    `).run(user.email, tokenHash, expiresAt)

    // Local development only
    const resetLink =
      `http://localhost:5173/?resetToken=${token}`

    console.log('Password reset link:', resetLink)

    res.json({
      message: 'Reset link generated. Check the backend terminal.',
      resetLink
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ error: 'Could not request password reset.' })
  }
})

// RESET PASSWORD
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body

  if (
    typeof token !== 'string' ||
    !token ||
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 72
  ) {
    return res.status(400).json({
      error: 'A valid token and password of 8–72 characters are required.'
    })
  }

  try {
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex')

    const resetRecord = db.prepare(`
      SELECT email
      FROM password_resets
      WHERE token_hash = ? AND expires_at > ?
    `).get(tokenHash, Date.now())

    if (!resetRecord) {
      return res.status(400).json({
        error: 'Invalid or expired reset link.'
      })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const result = db.prepare(`
      UPDATE users
      SET passwordHash = ?
      WHERE email = ?
    `).run(passwordHash, resetRecord.email)

    if (result.changes === 0) {
      return res.status(400).json({
        error: 'User account not found.'
      })
    }

    db.prepare(`
      DELETE FROM password_resets
      WHERE email = ?
    `).run(resetRecord.email)

    return res.json({
      message: 'Password reset successfully. You can now log in.'
    })
  } catch (error) {
    console.error('Reset password error:', error)

    return res.status(500).json({
      error: 'Could not reset password.'
    })
  }
})

// Function to check if a message is related to the emission dashboard



function isEmissionDashboardQuestion(message) {
  const text = message.toLowerCase()

  return /\b(emission|emissions|co2|carbon|history|historical|calculation|calculations|dashboard|vehicle|vehicles|bike|bikes|motorcycle|motorcycles|petrol|fuel|travelled|traveled|distance|kilometres|kilometers|km|greener|alternative|eco|budget|footprint|most-used|most used|highest|lowest|reduce|saved|records)\b/i.test(text)
}


// Gemini AI Assistant endpoint

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null

app.post('/api/assistant', requireAuth, async (req, res) => {
  try {
    const message = String(req.body.message || '').trim()

    if (!message) {
      return res.status(400).json({
        error: 'Please enter a message.'
      })
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: 'Message must be 4000 characters or fewer.'
      })
    }

    if (!genAI) {
      return res.status(503).json({
        error: 'Gemini is not configured. Check your backend .env file.'
      })
    }

    let dashboardContext = ''

    if (isEmissionDashboardQuestion(message)) {
      const summary = db.prepare(`
        SELECT
          COUNT(*) AS totalCalculations,
          COALESCE(SUM(co2Kg), 0) AS totalCO2,
          COALESCE(SUM(distanceKm), 0) AS totalDistance
        FROM calculation_history
        WHERE userId = ?
      `).get(req.user.id)

      const history = db.prepare(`
        SELECT vehicleMake, vehicleModel, modelYear,
               distanceKm, co2Kg, calculatedAt
        FROM calculation_history
        WHERE userId = ?
        ORDER BY calculatedAt DESC, id DESC
        LIMIT 5
      `).all(req.user.id)

      
      const vehicleEmissions = db.prepare(`
        SELECT
          vehicleMake,
          vehicleModel,
          modelYear,
          COUNT(*) AS calculations,
          SUM(distanceKm) AS totalDistanceKm,
          SUM(fuelConsumedLitres) AS totalFuelLitres,
          SUM(co2Kg) AS totalCO2Kg
        FROM calculation_history
        WHERE userId = ?
        GROUP BY vehicleMake, vehicleModel, modelYear
        ORDER BY totalCO2Kg DESC
      `).all(req.user.id)



      if (summary.totalCalculations > 0) {
        dashboardContext = `
Total saved calculations: ${summary.totalCalculations}
Total CO2 emissions: ${Number(summary.totalCO2).toFixed(2)} kg
Total distance travelled: ${Number(summary.totalDistance).toFixed(2)} km

Emissions grouped by vehicle, highest first:
${vehicleEmissions.map((vehicle, index) => `
${index + 1}. ${vehicle.vehicleMake} ${vehicle.vehicleModel} (${vehicle.modelYear})
Total CO2: ${Number(vehicle.totalCO2Kg).toFixed(2)} kg
Distance: ${Number(vehicle.totalDistanceKm).toFixed(2)} km
Fuel: ${Number(vehicle.totalFuelLitres).toFixed(2)} litres
Calculations: ${vehicle.calculations}
`).join('\n')}



Latest five records:
${history.map((item, index) => `
${index + 1}. ${item.vehicleMake} ${item.vehicleModel} (${item.modelYear})
Distance: ${item.distanceKm} km
CO2: ${Number(item.co2Kg).toFixed(2)} kg
Date: ${item.calculatedAt}
`).join('\n')}
`
      } else {
        dashboardContext = 'No saved emission calculations were found for this user.'
      }
    }

    const prompt = `
You are Carbon Footprint Assistant, a helpful environmental
and vehicle-emissions assistant.


Answer clearly and accurately.
Keep answers short and answer only what the user asks.
Never claim that dashboard data is missing if it is present in the supplied context.
For questions about which vehicle emits the most, use the emissions grouped by vehicle and identify the vehicle with the highest total CO2.
For greener alternatives, use the saved vehicle model and fuel type when available. Clearly distinguish estimated suggestions from measured dashboard data.
Do not invent user statistics.

Use a dot (.) for bullet points only when a list is necessary.
Never use asterisks (*) for formatting.
Avoid unnecessary introductions and extra information.

User's saved dashboard data:
${dashboardContext || 'No dashboard data was retrieved for this question.'}
When asked for total or all-time emissions, report the total CO2 emissions
from all saved calculations. Do not add together records manually in your
response or invent missing values.

User question:
${message}
`

    let reply

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log('Sending request to Gemini...')

        const result = await genAI.models.generateContent({
          model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
          contents: prompt
        })

        console.log('Gemini response received')

        reply = result.text?.trim()

        if (!reply) {
          return res.status(502).json({
            error: 'Gemini returned an empty response. Please try again.'
          })
        }

        break
      } catch (error) {
        const errorMessage = String(error.message || error)

        console.error(`Gemini attempt ${attempt} failed:`, errorMessage)

        const retryable =
          /503|UNAVAILABLE|high demand|429|RESOURCE_EXHAUSTED/i.test(
            errorMessage
          )

        if (!retryable || attempt === 3) {
          throw error
        }

        await new Promise(resolve =>
          setTimeout(resolve, attempt * 1500)
        )
      }
    }

    return res.json({ reply })
  } catch (error) {
    const errorMessage = String(error.message || error)

    console.error('Gemini assistant error:', errorMessage)

    const temporarilyUnavailable =
      /503|UNAVAILABLE|high demand|429|RESOURCE_EXHAUSTED/i.test(
        errorMessage
      )

    return res.status(temporarilyUnavailable ? 503 : 500).json({
      error: temporarilyUnavailable
        ? 'The AI assistant is temporarily busy. Please try again shortly.'
        : 'The assistant could not respond right now. Please try again.'
    })
  }
})

app.listen(5000, () => {
  console.log('Server running on port 5000')
})
