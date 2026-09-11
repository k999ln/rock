# Device bring-up only. These are the existing Android P1 components, not the
# Linux Hub / Wallet / Game runtime. Keep ordinary app UIDs and upstream policy.
ifeq ($(OFFICIAL_BUILD),true)
  $(error RockstarOS must not use the GrapheneOS official update service)
endif

PRODUCT_PACKAGES += RockAutomationPrototype RockArticleToolPrototype
PRODUCT_PRODUCT_PROPERTIES += \
    ro.rockstaros.stage=device-bringup \
    ro.rockstaros.financial_ready=false
