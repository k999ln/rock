"""Host-only input sequence checked against the actual C renderer and Wallet.

No service/socket access: live calls send only native pointer/key input. Geometry
is pinned by test_wallet_replay.py with current authenticated service snapshots.
"""

import time

# Names are also the C renderer actions checked before every test pointer input.
CONTROLS = {
    'home': ('ACTION_NAV', (606, 912)),
    'register': ('ACTION_WALLET_REGISTER', (360, 360)),
    'enroll': ('ACTION_AUTH_BEGIN', (360, 480)),
    'enroll_pin': ('ACTION_AUTH_PIN', (360, 419)),
    'sign': ('ACTION_AUTH_SIGN', (520, 833)),
    'terms': ('ACTION_WALLET_TERMS', (360, 480)),
    'confirm': ('ACTION_CONFIRM', (497, 576)),
    'consent': ('ACTION_CONSENT', (360, 504)),
    'bill': ('ACTION_BILL', (360, 567)),
    'expand': ('ACTION_WALLET_EXPAND', (360, 807)),
    'amount': ('ACTION_AMOUNT', (360, 461)),
    'sale': ('ACTION_SALE', (192, 537)),
    'settle': ('ACTION_SETTLE', (563, 716)),
    'atm_open': ('ACTION_ATM_OPEN', (531, 26)),
    'atm_issue': ('ACTION_ATM_ISSUE', (360, 640)),
    'atm_pin': ('ACTION_AUTH_PIN', (360, 536)),
    'atm_status': ('ACTION_ATM_STATUS', (360, 725)),
    'atm_cancel': ('ACTION_ATM_CANCEL', (360, 651)),
}


def action(ui, name):
    ui.click(*CONTROLS[name][1])


def confirm_pin(ui, profile, capture_name, marker, wait_marker):
    # Share the original 25-second stage budget across visible readiness,
    # explicit input, actual enabled-button click and authoritative receipt.
    deadline = time.monotonic() + 25
    ui.wait_pin_ready(profile, 0, deadline)
    ui.capture(capture_name)
    action(ui, 'enroll_pin' if profile == 'enroll' else 'atm_pin')
    ui.pin()
    ui.wait_pin_ready(profile, 4, deadline)
    if time.monotonic() >= deadline:
        raise TimeoutError('PIN readiness exhausted the original stage deadline')
    action(ui, 'sign')
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('PIN confirmation exhausted the original stage deadline')
    wait_marker(marker, remaining)
    if time.monotonic() >= deadline:
        raise TimeoutError('PIN receipt was observed after the original stage deadline')


def run_wallet(ui, wait_marker, sleep):
    def wallet_home():
        action(ui, 'home')
        sleep(1.5)
    wait_marker('ROCK_UI_WALLET_OBSERVER_READY', 180)
    sleep(3)
    wallet_home()
    ui.capture('00-unregistered-zero-wallet')
    action(ui, 'register')
    wait_marker('ROCK_UI_WALLET_REGISTERED')
    sleep(3)
    wallet_home()
    ui.capture('01-registered-without-consent')
    action(ui, 'enroll')
    wait_marker('ROCK_UI_WALLET_AUTH_CHALLENGE')
    confirm_pin(ui, 'enroll', 'auth-01-explicit-enrollment',
                'ROCK_UI_WALLET_AUTH_ENROLLED', wait_marker)
    sleep(3)
    wallet_home()
    ui.capture('auth-02-enrolled-wallet-terms-required')
    action(ui, 'terms')
    sleep(0.5)
    ui.capture('auth-03-separate-wallet-terms')
    action(ui, 'confirm')
    wait_marker('ROCK_UI_WALLET_AUTH_ACTIVE')
    sleep(3)
    wallet_home()
    # Actual registered/authenticated C layout: one PageDown puts monthly
    # consent at y479–529 and billing at y545–589, with no response banner.
    ui.keys(['pgdn'])
    action(ui, 'consent')
    wait_marker('ROCK_UI_WALLET_CONSENTED')
    sleep(3)
    wallet_home()
    ui.capture('02-explicit-consent-before-credit')
    # Before expansion, the final action is anchored above the nav
    # when PageDown reaches the content end, including error text.
    for _ in range(3):
        ui.keys(['pgdn'])
    action(ui, 'expand')
    for _ in range(2):
        ui.keys(['pgdn'])
    ui.capture('03-simulator-controls')
    action(ui, 'amount')
    ui.keys(['ctrl', 'a'])
    ui.type('20.00')
    sleep(1.2)
    ui.capture('04-native-test-amount-input')
    action(ui, 'sale')
    wait_marker('ROCK_UI_WALLET_CREDIT_PENDING')
    sleep(3)
    ui.capture('05-actual-unsettled-credit')
    action(ui, 'settle')
    wait_marker('ROCK_UI_WALLET_CREDIT_SETTLED')
    sleep(3)
    ui.capture('06-actual-settlement')
    wallet_home()
    ui.keys(['pgdn'])
    action(ui, 'bill')
    wait_marker('ROCK_UI_WALLET_BILLED_ONCE')
    sleep(3)
    wallet_home()
    ui.capture('07-888-test-fee-paid')
    ui.keys(['pgdn'])
    action(ui, 'bill')
    wait_marker('ROCK_UI_WALLET_BILL_REPEATED_ONCE')
    sleep(3)
    wallet_home()
    ui.capture('08-second-request-still-one-bill')
    ui.keys(['pgdn'])
    action(ui, 'consent')
    wait_marker('ROCK_UI_WALLET_CANCELED')
    sleep(3)
    wallet_home()
    ui.capture('09-renewal-canceled-paid-period-kept')
    ui.keys(['pgdn'])
    sleep(1.2)
    ui.capture('10-actual-1112-test-balance')


def run_atm(ui, wait_marker, sleep):
    def wallet_home():
        action(ui, 'home')
        sleep(1.5)
    wait_marker('ROCK_UI_ATM_OBSERVER_READY', 180)
    sleep(3)
    wallet_home()
    ui.capture('00-unregistered-zero-wallet')
    action(ui, 'register')
    wait_marker('ROCK_UI_ATM_REGISTERED')
    sleep(3)
    wallet_home()
    ui.capture('01-registered-no-billing-consent')
    action(ui, 'enroll')
    wait_marker('ROCK_UI_ATM_AUTH_CHALLENGE')
    confirm_pin(ui, 'enroll', 'auth-01-explicit-enrollment',
                'ROCK_UI_ATM_AUTH_ENROLLED', wait_marker)
    sleep(3)
    wallet_home()
    ui.capture('auth-02-enrolled-wallet-terms-required')
    action(ui, 'terms')
    sleep(0.5)
    ui.capture('auth-03-separate-wallet-terms')
    action(ui, 'confirm')
    wait_marker('ROCK_UI_ATM_AUTH_ACTIVE')
    sleep(3)
    wallet_home()
    for _ in range(3):
        ui.keys(['pgdn'])
    action(ui, 'expand')
    for _ in range(2):
        ui.keys(['pgdn'])
    action(ui, 'amount')
    ui.keys(['ctrl', 'a'])
    ui.type('50.00')
    sleep(1.2)
    ui.capture('02-native-test-credit-amount')
    action(ui, 'sale')
    wait_marker('ROCK_UI_ATM_CREDIT_PENDING')
    sleep(3)
    ui.capture('03-actual-unsettled-credit')
    action(ui, 'settle')
    wait_marker('ROCK_UI_ATM_CREDIT_SETTLED')
    sleep(3)
    ui.capture('04-actual-settled-5000')
    action(ui, 'atm_open')
    sleep(2)
    ui.capture('05-owner-atm-before-issue')
    action(ui, 'atm_issue')
    confirm_pin(ui, 'atm', '06-owner-issue-confirmation',
                'ROCK_UI_ATM_ISSUED', wait_marker)
    sleep(3)
    ui.capture('07-issued-1000-held-code-hidden')
    action(ui, 'atm_status')
    sleep(2)
    ui.capture('08-current-owner-status-code-hidden')
    action(ui, 'atm_cancel')
    wait_marker('ROCK_UI_ATM_CANCELED')
    sleep(3)
    ui.capture('09-canceled-code-unusable')
    wallet_home()
    sleep(1)
    ui.keys(['pgdn'])
    ui.capture('10-wallet-5000-returned-zero-held')
