const express = require('express');
const session = require('express-session');
const faker = require('faker');
const path = require('path');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure session store for Vercel
const sessionStore = new session.MemoryStore();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: 'chase-fake-secret',
  resave: true,
  saveUninitialized: true,
  store: sessionStore,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    httpOnly: true,
    path: '/'
  },
  name: 'sessionId' // Explicitly set session cookie name
}));

// Helper function to generate fake transactions
function generateTransactions(accountNumber, startDate, endDate) {
  const transactions = [];
  const categories = ['Shopping', 'Dining', 'Transportation', 'Entertainment', 'Bills', 'Deposit', 'Transfer'];
  let balance = parseFloat(faker.finance.amount(1000, 5000, 2));
  
  const currentDate = moment(startDate);
  const end = moment(endDate);
  
  while (currentDate.isBefore(end)) {
    const amount = parseFloat(faker.finance.amount(-200, 200, 2));
    balance += amount;
    
    transactions.push({
      date: currentDate.format('MM/DD/YYYY'),
      description: faker.company.companyName(),
      category: faker.random.arrayElement(categories),
      amount: Math.abs(amount).toFixed(2),
      type: amount > 0 ? 'credit' : 'debit',
      balance: balance.toFixed(2)
    });
    
    currentDate.add(1, 'days');
  }
  
  return transactions;
}

// Generate fake user data
const fakeUser = {
  username: 'user',
  password: 'password',
  name: faker.name.findName(),
  accounts: [
    {
      type: 'Checking',
      number: '21865912',  // Fixed account number for checking
      balance: faker.finance.amount(1000, 50000, 2, '$'),
      name: 'My Checking'
    },
    {
      type: 'Savings',
      number: '87254837',  // Fixed account number for savings
      balance: faker.finance.amount(5000, 250000, 2, '$'),
      name: 'My Savings'
    }
  ],
  cards: [
    {
      type: 'credit',
      number: faker.finance.creditCardNumber(),
      expiryDate: '12/25',
      cvv: '123'
    }
  ],
  transactions: generateTransactions(
    '21865912',
    moment().subtract(90, 'days'),
    moment()
  )
};

// Middleware to check login with debug logging
function requireLogin(req, res, next) {
  console.log('Checking login status');
  console.log('Session state:', {
    loggedIn: req.session.loggedIn,
    hasUser: !!req.session.user,
    sessionID: req.session.id
  });
  
  if (req.session && req.session.loggedIn && req.session.user) {
    console.log('User is logged in');
    next();
  } else {
    console.log('User is not logged in, redirecting to login');
    res.redirect('/login');
  }
}

// Routes
app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
  if (req.session.loggedIn) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', { username, password });
  
  if (username === fakeUser.username && password === fakeUser.password) {
    // Set session data
    req.session.loggedIn = true;
    req.session.user = fakeUser;
    
    // Debug logs
    console.log('Login successful');
    console.log('Session after login:', {
      loggedIn: req.session.loggedIn,
      hasUser: !!req.session.user,
      sessionID: req.session.id
    });
    
    // Force session save before redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.render('login', { error: 'An error occurred. Please try again.' });
      }
      console.log('Session saved, redirecting to dashboard');
      res.redirect('/dashboard');
    });
  } else {
    console.log('Login failed');
    res.render('login', { error: 'Invalid username or password.' });
  }
});

app.get('/dashboard', requireLogin, (req, res) => {
  console.log('Dashboard access attempt');
  console.log('Session state:', req.session);
  
  if (!req.session.loggedIn || !req.session.user) {
    console.log('Session invalid, redirecting to login');
    return res.redirect('/login');
  }
  
  res.render('dashboard', { user: req.session.user });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// API Routes
app.post('/api/transfer', (req, res) => {
  console.log('Received transfer request:', req.body);
  
  const { fromAccount, toAccount, amount, date } = req.body;
  const transferAmount = parseFloat(amount);

  // Find the accounts
  const fromAcc = fakeUser.accounts.find(acc => acc.number === fromAccount);
  const toAcc = fakeUser.accounts.find(acc => acc.number === toAccount);

  console.log('Found accounts:', {
    fromAccount,
    toAccount,
    fromAcc,
    toAcc,
    transferAmount
  });

  if (!fromAcc || !toAcc) {
    console.log('Invalid account numbers:', { fromAccount, toAccount });
    return res.status(400).json({ error: 'Invalid account number' });
  }

  // Update account balances
  const fromBalance = parseFloat(fromAcc.balance.replace('$', ''));
  const toBalance = parseFloat(toAcc.balance.replace('$', ''));
  
  fromAcc.balance = (fromBalance - transferAmount).toFixed(2);
  toAcc.balance = (toBalance + transferAmount).toFixed(2);

  console.log('Updated balances:', {
    fromBalance: fromAcc.balance,
    toBalance: toAcc.balance
  });

  // Add transaction records
  const transactionDate = date || new Date().toISOString().split('T')[0];
  
  // Add debit transaction
  fakeUser.transactions.unshift({
    date: transactionDate,
    description: `Transfer to ${toAcc.type} Account`,
    category: 'Transfer',
    type: 'debit',
    amount: transferAmount.toFixed(2),
    balance: fromAcc.balance
  });

  // Add credit transaction
  fakeUser.transactions.unshift({
    date: transactionDate,
    description: `Transfer from ${fromAcc.type} Account`,
    category: 'Transfer',
    type: 'credit',
    amount: transferAmount.toFixed(2),
    balance: toAcc.balance
  });

  console.log('Added transactions');

  // Return updated accounts
  res.json({
    success: true,
    accounts: fakeUser.accounts,
    message: 'Transfer completed successfully'
  });
});

app.post('/api/cards', requireLogin, (req, res) => {
  const { cardType, cardNumber, expiryDate, cvv } = req.body;
  
  // Validate card number (Luhn algorithm)
  const isValidCard = validateCardNumber(cardNumber);
  if (!isValidCard) {
    return res.status(400).json({ error: 'Invalid card number' });
  }
  
  // Validate expiry date
  const [month, year] = expiryDate.split('/');
  const currentYear = moment().year() % 100;
  const currentMonth = moment().month() + 1;
  
  if (parseInt(year) < currentYear || 
      (parseInt(year) === currentYear && parseInt(month) < currentMonth)) {
    return res.status(400).json({ error: 'Card has expired' });
  }
  
  // Validate CVV
  if (!/^\d{3,4}$/.test(cvv)) {
    return res.status(400).json({ error: 'Invalid CVV' });
  }
  
  const newCard = {
    type: cardType,
    number: cardNumber,
    expiryDate,
    cvv
  };
  
  fakeUser.cards.push(newCard);
  
  res.json({ success: true, cards: fakeUser.cards });
});

app.put('/api/accounts', requireLogin, (req, res) => {
  const { accountNumber, accountName, accountType } = req.body;
  const account = fakeUser.accounts.find(acc => acc.number === accountNumber);
  
  if (!account) {
    return res.status(400).json({ error: 'Account not found' });
  }
  
  account.name = accountName;
  account.type = accountType;
  
  res.json({ success: true, account });
});

app.get('/api/transactions', requireLogin, (req, res) => {
  const { accountNumber, days } = req.query;
  let filteredTransactions = [...fakeUser.transactions];
  
  if (accountNumber && accountNumber !== 'all') {
    filteredTransactions = filteredTransactions.filter(tx => 
      tx.description.includes(accountNumber)
    );
  }
  
  if (days) {
    const cutoffDate = moment().subtract(parseInt(days), 'days');
    filteredTransactions = filteredTransactions.filter(tx => 
      moment(tx.date, 'MM/DD/YYYY').isAfter(cutoffDate)
    );
  }
  
  res.json({ transactions: filteredTransactions });
});

app.get('/statement/:accountNumber', requireLogin, (req, res) => {
  const { accountNumber } = req.params;
  const account = fakeUser.accounts.find(acc => acc.number === accountNumber);
  
  if (!account) {
    return res.status(404).send('Account not found');
  }
  
  const statementTransactions = fakeUser.transactions.filter(tx => 
    tx.description.includes(account.type)
  );
  
  res.render('statement', {
    account,
    transactions: statementTransactions,
    period: {
      start: moment().subtract(30, 'days').format('MM/DD/YYYY'),
      end: moment().format('MM/DD/YYYY')
    }
  });
});

// Helper function to validate card numbers using Luhn algorithm
function validateCardNumber(cardNumber) {
  const digits = cardNumber.split('').map(Number);
  const lastDigit = digits.pop();
  
  const sum = digits
    .reverse()
    .map((digit, index) => index % 2 === 0 ? digit * 2 : digit)
    .map(digit => digit > 9 ? digit - 9 : digit)
    .reduce((acc, digit) => acc + digit, 0);
  
  return (sum + lastDigit) % 10 === 0;
}

// Modify the server startup for Vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

// Export the Express app for Vercel
module.exports = app;