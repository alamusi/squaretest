require('dotenv').config()

const express = require('express')
const request = require('request')
const fs = require('fs')
const uuidv4 = require('uuid/v4')
const debug = require('debug')('square.test')

const PORT = process.env.PORT || 4000
let host = 'http://localhost:' + PORT
const iosCallback = '/ios'
const androidCallback = '/android'
const state = uuidv4()

const app = express()
app.listen(PORT, () => {
  console.log('Listening on port: ', PORT)
})

/**
 * test data
 */
const file = './data.json'
const data = fs.existsSync(file) ? require(file) : {
  oauth: {},
  locations: [{}],
  transaction: {},
  refund: {}
}

const APP_ID = process.env.SQUARE_APP_ID
const APP_SECRET = process.env.SQUARE_APP_SECRET

debug('id:\t', APP_ID)
debug('secret:\t', APP_SECRET)
debug('oauth:\t', data.oauth)
debug('locations:\t', data.locations)
debug('transaction:\t', data.transaction)
debug('refund:\t', data.refund)

/**
 * main page
 *  - authorize
 *  - charge
 *  - refund
 */
app.get('/', (req, res) => {
  // https://docs.connect.squareup.com/api/oauth#get-authorize
  const scope = [
    'MERCHANT_PROFILE_READ',
    'PAYMENTS_READ',
    'PAYMENTS_WRITE']

  // https://docs.connect.squareup.com/articles/web-api-ios
  const ios = {
    amount_money: {
      amount: 100,
      currency_code: 'CAD'
    },
    callback_url: host + iosCallback,
    client_id: APP_ID,
    location_id: data.locations[0].id,
    version: '1.3',
    notes: 'mmf test charge',
    state: state,
    options: {
      supported_tender_types: ['CREDIT_CARD', 'CASH', 'OTHER'],
      auto_return: true,
      skip_receipt: true
    }
  }
  // https://docs.connect.squareup.com/articles/web-api-android
  // https://github.com/square/point-of-sale-android-sdk/blob/master/point-of-sale-sdk/src/main/java/com/squareup/sdk/pos/PosApi.java
  const android = [
    'i.com.squareup.pos.TOTAL_AMOUNT=100',
    'S.com.squareup.pos.CURRENCY_CODE=CAD',
    'S.com.squareup.pos.WEB_CALLBACK_URI=' + host + androidCallback,
    'S.com.squareup.pos.CLIENT_ID=' + APP_ID,
    'S.com.squareup.pos.LOCATION_ID=' + data.locations[0].id,
    'l.com.squareup.pos.AUTO_RETURN_TIMEOUT_MS=3200', // between 3200 and 10000
    'S.com.squareup.pos.API_VERSION=v2.0',
    'S.com.squareup.pos.NOTE=mmf%20test%20charge',
    'S.com.squareup.pos.REQUEST_METADATA=' + state,
    'S.com.squareup.pos.TENDER_TYPES=com.squareup.pos.TENDER_CARD,com.squareup.pos.TENDER_CASH,com.squareup.pos.TENDER_OTHER'
  ]

  res.send(
  `
  <html><body>
    <h1><a href="https://connect.squareup.com/oauth2/authorize?client_id=${APP_ID}&scope=${encodeURIComponent(scope.join(','))}">OAuth</a></h1>
    <pre>OAuth: ${JSON.stringify(data.oauth, null, 2)}</pre><br>
    <h1 style="display: ${data.oauth.access_token ? 'block' : 'none'};"><a href="/renew">Renew Token</a></h1>
    <h1 style="display: ${data.oauth.access_token ? 'block' : 'none'};"><a href="/revoke">Revoke Token</a></h1>
    <hr>
    <h1 style="display: ${data.oauth.access_token ? 'block' : 'none'};"><a href="/locations">Get Locations</a></h1>
    <pre>Locations: ${JSON.stringify(data.locations, null, 2)}</pre><br>
    <hr>
    <h1><a href="square-commerce-v1://payment/create?data=${encodeURIComponent(JSON.stringify(ios))}">iOS Charge ($1.00) to Locations[0]</a></h1>
    <h1><a href="intent:#Intent;action=com.squareup.pos.action.CHARGE;package=com.squareup;${android.join(';')};end;">Android Charge ($1.00) to Locations[0]</a></h1>
    <pre>Transacation: ${JSON.stringify(data.transaction, null, 2)}</pre><br>
    <hr>
    <h1 style="display: ${data.transaction.id ? 'block' : 'none'};"><a href="/refund">Fully Refund Transaction.tenders[0]</a></h1>
    <pre>Refund: ${JSON.stringify(data.refund, null, 2)}</pre><br>
    <hr>
    <h1 style="display: ${data.oauth.access_token ? 'block' : 'none'};"><a target="_blank" href="/transactions">List Transactions</a></h1>
  </body></html>
  `
  )
})

/**
 * oauth endpoint
 * https://docs.connect.squareup.com/api/oauth#post-token
 */
app.get('/oauth', (req, res) => {
  debug('entering oauth', req.query)
  let options = {
    url: 'https://connect.squareup.com/oauth2/token',
    body: {
      client_id: APP_ID,
      client_secret: APP_SECRET,
      code: req.query.code,
      redirect_uri: host
    },
    json: true
  }
  request.post(options, (err, response, body) => {
    if (err) {
      debug(err)
      res.send(err)
    } else {
      data.oauth = body
      debug(body)
      save()
      res.redirect('/')
    }
  })
})

/**
 * token renew endpoint
 * https://docs.connect.squareup.com/api/oauth#post-renew
 */
app.get('/renew', (req, res) => {
  debug('entering token renewal', req.query)
  let options = {
    url: 'https://connect.squareup.com/oauth2/clients/' + APP_ID + '/access-token/renew',
    body: {
      access_token: data.oauth.access_token
    },
    headers: {
      Authorization: 'Client ' + APP_SECRET
    },
    json: true
  }
  request.post(options, (err, response, body) => {
    if (err) {
      debug(err)
      res.send(err)
    } else {
      data.oauth = body
      debug(body)
      save()
      res.redirect('/')
    }
  })
})

/**
 * token revoke endpoint
 * https://docs.connect.squareup.com/api/oauth#post-revoke
 */
app.get('/revoke', (req, res) => {
  debug('entering token revoke', req.query)
  let options = {
    url: 'https://connect.squareup.com/oauth2/revoke',
    body: {
      client_id: APP_ID,
      access_token: data.oauth.access_token
    },
    headers: {
      Authorization: 'Client ' + APP_SECRET
    },
    json: true
  }
  request.post(options, (err, response, body) => {
    if (err) {
      debug(err)
      res.send(err)
    } else {
      // {"success" : true}
      data.oauth = {}
      debug(body)
      save()
      res.redirect('/')
    }
  })
})

/**
 * get locations
 * https://docs.connect.squareup.com/api/connect/v2#endpoint-listlocations
 */
app.get('/locations', (req, res) => {
  debug('entering locations', req.query)
  let options = {
    url: 'https://connect.squareup.com/v2/locations',
    headers: {
      Authorization: 'Bearer ' + data.oauth.access_token
    },
    json: true
  }
  request.get(options, (err, response, body) => {
    if (err) {
      debug(err)
      res.send(err)
    } else {
      data.locations = body.locations
      debug(body)
      save()
      res.redirect('/')
    }
  })
})

/**
 * iosCallback endpoint
 * https://docs.connect.squareup.com/articles/web-api-ios
 */
app.get(iosCallback, (req, res) => {
  debug('entering iosCallback', req.query)
  let result = JSON.parse(req.query.data)
  let status = result.status
  let transactionState = result.state
  let transactionId = result.transaction_id
  let clientTransactionId = result.client_transaction_id
  debug(transactionState, transactionId, clientTransactionId)
  if (status === 'ok') {
    retrieveTransaction(transactionId, clientTransactionId).then(transaction => {
      debug('iosCallback success', transaction)
      res.redirect('/')
    }).catch(error => {
      debug('iosCallback error', error)
      res.send(error)
    })
  } else {
    res.send(result)
  }
})

/**
 * androidCallback endpoint
 * https://docs.connect.squareup.com/articles/web-api-android
 */
app.get(androidCallback, (req, res) => {
  debug('entering androidCallback', req.query)
  let transactionState = req.query['com.squareup.pos.RESULT_REQUEST_METADATA']
  let transactionId = req.query['com.squareup.pos.SERVER_TRANSACTION_ID']
  let clientTransactionId = req.query['com.squareup.pos.CLIENT_TRANSACTION_ID']
  debug(transactionState, transactionId, clientTransactionId)
  if (transactionId || clientTransactionId) {
    retrieveTransaction(transactionId, clientTransactionId).then(transaction => {
      debug('androidCallback success', transaction)
      res.redirect('/')
    }).catch(error => {
      debug('androidCallback error', error)
      res.send(error)
    })
  } else {
    res.send(req.query)
  }
})

/**
 * retrieve transaction
 * https://docs.connect.squareup.com/api/connect/v2#endpoint-retrievetransaction
 */
function retrieveTransaction (transactionId, clientTransactionId) {
  // there is a situation that transaction_id is missing in the response, need to list out the transactions, iterate through, and match one
  let options = {
    url: 'https://connect.squareup.com/v2/locations/' + data.locations[0].id + '/transactions' + (transactionId ? ('/' + transactionId) : '?sort_order=DESC'),
    headers: {
      Authorization: 'Bearer ' + data.oauth.access_token
    },
    json: true
  }
  return new Promise((resolve, reject) => {
    request.get(options, (err, response, body) => {
      if (err) {
        reject(err)
      } else if (body.errors) {
        reject(body.errors)
      } else {
        if (transactionId) {
          // simply take the transaction
          data.transaction = body.transaction
        } else {
          // search through the latest 50 transactions
          body.transactions.forEach(transaction => {
            if (transaction.client_id === clientTransactionId) {
              data.transaction = transaction
            }
          })
        }
        save()
        resolve(data.transaction)
      }
    })
  })
}

/**
 * refund endpoint
 * https://docs.connect.squareup.com/api/connect/v2#endpoint-createrefund
 */
app.get('/refund', (req, res) => {
  debug('entering refund', req.query)
  let options = {
    url: 'https://connect.squareup.com/v2/locations/' + data.locations[0].id + '/transactions/' + data.transaction.id + '/refund',
    body: {
      idempotency_key: uuidv4(),
      tender_id: data.transaction.tenders[0].id,
      reason: 'mmf test refund',
      amount_money: data.transaction.tenders[0].amount_money
    },
    headers: {
      Authorization: 'Bearer ' + data.oauth.access_token
    },
    json: true
  }
  debug(options)
  request.post(options, (err, response, body) => {
    if (err) {
      debug(err)
      res.send(err)
    } else if (body.errors) {
      debug(body.errors)
      res.send(body.errors)
    } else {
      data.refund = body.refund
      debug(body.refund)
      save()
      res.redirect('/')
    }
  })
})

/**
 * list transactions endpoint
 * https://docs.connect.squareup.com/api/connect/v2#endpoint-retrievetransaction
 */
app.get('/transactions', (req, res) => {
  debug('entering list txs', req.query)
  let options = {
    url: 'https://connect.squareup.com/v2/locations/' + data.locations[0].id + '/transactions',
    headers: {
      Authorization: 'Bearer ' + data.oauth.access_token
    },
    json: true
  }
  request.get(options, (err, response, body) => {
    if (err) {
      debug(err)
      res.send(err)
    } else if (body.errors) {
      debug(body.errors)
      res.send(body.errors)
    } else {
      debug(body.transactions)
      res.send(body.transactions)
    }
  })
})

/**
 * sanity
 */
app.get('/test', (req, res) => {
  res.send('test' + new Date())
})

/**
 * localtunnel
 */
const localtunnel = require('localtunnel')
if (process.env.LOCALTUNNEL === 'true') {
  let tunnel = localtunnel(PORT, {
    subdomain: process.env.LOCALTUNNEL_SUBDOMAIN
  }, (err, tunnel) => {
    if (err) {
      debug(err)
      // let exit = process.exit
    }
    debug('localhost is now tunnelling through', tunnel.url)
    host = tunnel.url
    // cleanup localtunnel
    process.on('exit', () => {
      tunnel.close()
    })
  })

  tunnel.on('close', function () {
    debug('localhost is no longer tunnelling through', tunnel.url)
  })
}

/**
 * save data
 */
function save () {
  fs.writeFile(file, JSON.stringify(data, null, 2), (error) => {
    if (error) {
      debug('save data failed!', error)
    } else {
      debug('save data successfully!')
    }
  })
}
