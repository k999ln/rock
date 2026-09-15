# Virtual device only. The rock repository must be checked out at device/rock.
$(call inherit-product, device/google/cuttlefish/vsoc_x86_64/phone/aosp_cf.mk)
PRODUCT_NAME := rock_cf_x86_64_phone
PRODUCT_BRAND := RockStar
PRODUCT_MODEL := Rock star OS development prototype
PRODUCT_MANUFACTURER := RockStar
PRODUCT_PACKAGES += RockAutomationPrototype RockArticleToolPrototype
PRODUCT_PRIVATE_SEPOLICY_DIRS += device/rock/android/sepolicy/private
# Preserve AOSP launcher, SELinux enforcing, power policy, AVB and distinct app UIDs.
# No privileged/root grants, GMS, payments, or physical-device flash targets.
