const fs = require('fs')
const Database = require('better-sqlite3')
const express = require('express')
const { GoogleGenAI } = require('@google/genai')
const cors = require('cors')
require('dotenv').config()

const bcrypt = require('bcryptjs')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')

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

  if (
    cleanedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)
  ) {
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
  res.send('Eco Track+ Backend is running!')
})


app.get('/api/vehicles', (req, res) => {
   const vehicles = db.prepare('SELECT * FROM vehicles').all()
  res.json(vehicles)
})


app.get('/api/emission-factors', (req, res) => {
  const factors = db.prepare('SELECT * FROM emission_factors').all()
  res.json(factors)
})




app.post('/api/history', requireAuth, (req, res) => {
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

    res.status(201).json({
      message: 'Calculation saved successfully.',
      id: result.lastInsertRowid
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

  return /\b(emission|emissions|co2|carbon|history|historical|calculation|calculations|dashboard)\b/i.test(text)
    && /\b(my|mine|all|total|overall|history|historical|previous|last|latest|saved|recorded|calculate|show|what|how)\b/i.test(text)
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

  if (summary.totalCalculations > 0) {
    dashboardContext = `
Total saved calculations: ${summary.totalCalculations}
Total CO2 emissions: ${Number(summary.totalCO2).toFixed(2)} kg
Total distance travelled: ${Number(summary.totalDistance).toFixed(2)} km

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
You are EcoTrackPlus Assistant, a helpful environmental
and vehicle-emissions assistant.

Answer clearly and accurately.
Keep answers short and answer only what the user asks.
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