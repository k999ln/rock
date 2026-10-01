ROCK_PLATFORM_VERSION = 0.3.0
ROCK_PLATFORM_SITE = $(BR2_EXTERNAL_ROCK_PATH)/../platform
ROCK_PLATFORM_SITE_METHOD = local
ROCK_PLATFORM_LICENSE = Proprietary (project license not yet selected)
ROCK_PLATFORM_REDISTRIBUTE = NO
ROCK_PLATFORM_DEPENDENCIES = python3 sqlite libopenssl bubblewrap libseccomp

define ROCK_PLATFORM_BUILD_CMDS
	$(TARGET_MAKE_ENV) $(MAKE) $(TARGET_CONFIGURE_OPTS) -C $(@D)
endef

define ROCK_PLATFORM_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m 0755 $(@D)/rock-sandbox-exec $(TARGET_DIR)/usr/libexec/rock-sandbox-exec
endef

$(eval $(generic-package))
