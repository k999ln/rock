package dev.rock.shell;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.util.Currency;
import java.util.Locale;

/** Human-readable currency amounts used only by the Shell presentation layer. */
final class UsageCurrencyFormatter {
    private UsageCurrencyFormatter() {}

    static String formatMinor(long amountMinor, String currencyCode, Locale locale) {
        if (amountMinor < 0 || !validCode(currencyCode)) return "金額を確認できません";
        try {
            Currency currency = Currency.getInstance(currencyCode);
            int digits = currency.getDefaultFractionDigits();
            if (digits < 0 || digits > 6) return currencyCode + " " + amountMinor + " minor units";
            BigDecimal major = BigDecimal.valueOf(amountMinor).movePointLeft(digits);
            NumberFormat formatter = NumberFormat.getCurrencyInstance(locale);
            formatter.setCurrency(currency);
            formatter.setMinimumFractionDigits(digits);
            formatter.setMaximumFractionDigits(digits);
            return formatter.format(major);
        } catch (IllegalArgumentException unknownCurrency) {
            return currencyCode + " " + amountMinor + " minor units";
        }
    }

    /** Rate is micro-minor units per one million tokens, as signed in the rate card. */
    static String formatRatePerMillionTokens(long rateMinorMicros, String currencyCode, Locale locale) {
        if (rateMinorMicros < 0 || !validCode(currencyCode)) return "単価を確認できません";
        try {
            Currency currency = Currency.getInstance(currencyCode);
            int digits = currency.getDefaultFractionDigits();
            if (digits < 0 || digits > 6)
                return currencyCode + " " + rateMinorMicros + " micro-minor / 100万 tokens";
            int scale = Math.max(digits, 8);
            BigDecimal major = BigDecimal.valueOf(rateMinorMicros).movePointLeft(6 + digits)
                .setScale(scale, RoundingMode.HALF_UP);
            NumberFormat formatter = NumberFormat.getCurrencyInstance(locale);
            formatter.setCurrency(currency);
            formatter.setMinimumFractionDigits(digits);
            formatter.setMaximumFractionDigits(scale);
            return formatter.format(major) + " / 100万 tokens";
        } catch (IllegalArgumentException unknownCurrency) {
            return currencyCode + " " + rateMinorMicros + " micro-minor / 100万 tokens";
        }
    }

    /** Convert a user-entered major-unit amount to ISO minor units without rounding. */
    static Long parseMajorToMinor(String value, String currencyCode) {
        if (value == null || !validCode(currencyCode)) return null;
        try {
            int digits = Currency.getInstance(currencyCode).getDefaultFractionDigits();
            String fractionPattern = digits == 0 ? "" : "(?:\\.[0-9]{1," + digits + "})?";
            if (digits < 0 || digits > 6 || !value.trim().matches("(?:0|[1-9][0-9]{0,11})" + fractionPattern))
                return null;
            BigDecimal minor = new BigDecimal(value.trim()).movePointRight(digits).stripTrailingZeros();
            return minor.scale() > 0 || minor.signum() <= 0 ? null : minor.longValueExact();
        } catch (ArithmeticException | IllegalArgumentException invalid) {
            return null;
        }
    }

    private static boolean validCode(String value) {
        return value != null && value.matches("[A-Z]{3}");
    }
}
