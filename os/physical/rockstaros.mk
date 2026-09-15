# Device bring-up only. These are the existing Android P1 components, not the
# Linux Hub / Wallet / Game runtime. Keep ordinary app UIDs and upstream policy.
ifeq ($(OFFICIAL_BUILD),true)
  $(error RockstarOS must not use the GrapheneOS official update service)
endif
ifeq ($(wildcard vendor/rockstaros-local-ai/product.mk),)
  $(error Stage the reviewed Local Action Assistant APK before the physical OS build)
endif

include vendor/rockstaros-local-ai/product.mk

PRODUCT_PACKAGES += RockAutomationPrototype RockArticleToolPrototype
PRODUCT_PRODUCT_PROPERTIES += \
    ro.rockstaros.stage=device-bringup \
    ro.rockstaros.local_ai.stage=source-pinned \
    ro.rockstaros.local_ai.bridge=source-ready \
    ro.rockstaros.local_ai.package=com.localactionassistant \
    ro.rockstaros.financial_ready=false
