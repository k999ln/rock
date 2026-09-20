# Device bring-up only. These are the existing Android P1 components, not the
# Linux Hub / Wallet / Game runtime. Keep ordinary app UIDs and upstream policy.
ifeq ($(OFFICIAL_BUILD),true)
  $(error RockstarOS must not use the GrapheneOS official update service)
endif
ifeq ($(wildcard vendor/rockstaros-local-ai/product.mk),)
  $(error Stage the reviewed Local Action Assistant APK before the physical OS build)
endif
include vendor/rockstaros-local-ai/product.mk

ifeq ($(ROCK_OPERATOR_AGENT_MODE),excluded)
  ROCK_OPERATOR_AGENT_PACKAGES :=
  ROCK_OPERATOR_AGENT_STAGE := excluded
else
  ifeq ($(wildcard vendor/avocado-operator-agent/product.mk),)
    $(error Stage the reviewed production Operator Agent trust-anchor overlay before a release build)
  endif
  include vendor/avocado-operator-agent/product.mk
  ROCK_OPERATOR_AGENT_PACKAGES := RockOperatorAgent
  ROCK_OPERATOR_AGENT_STAGE := configured
endif

PRODUCT_PACKAGES += RockAutomationPrototype RockShell RockArticleToolPrototype $(ROCK_OPERATOR_AGENT_PACKAGES)
PRODUCT_PRIVATE_SEPOLICY_DIRS += external/rockstaros/android/sepolicy/private
PRODUCT_PRODUCT_PROPERTIES += \
    ro.rockstaros.stage=device-bringup \
    ro.rockstaros.platform_api=1 \
    ro.rockstaros.local_ai.stage=source-pinned \
    ro.rockstaros.local_ai.bridge=source-ready \
    ro.rockstaros.local_ai.package=com.localactionassistant \
    ro.rockstaros.operator_agent.stage=$(ROCK_OPERATOR_AGENT_STAGE) \
    ro.rockstaros.release_flash_allowed=false \
    ro.rockstaros.financial_ready=false
