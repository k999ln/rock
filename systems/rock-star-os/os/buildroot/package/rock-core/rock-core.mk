ROCK_CORE_VERSION = 0.1.0
ROCK_CORE_SITE = $(BR2_EXTERNAL_ROCK_PATH)/../core
ROCK_CORE_SITE_METHOD = local
ROCK_CORE_LICENSE = Proprietary (project license not yet selected)
ROCK_CORE_REDISTRIBUTE = NO

define ROCK_CORE_BUILD_CMDS
	# A host-built executable copied by local rsync is not a target build.
	$(TARGET_MAKE_ENV) $(MAKE) $(TARGET_CONFIGURE_OPTS) -C $(@D) clean
	$(TARGET_MAKE_ENV) $(MAKE) $(TARGET_CONFIGURE_OPTS) -C $(@D)
endef

define ROCK_CORE_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m 0755 $(@D)/rockd $(TARGET_DIR)/usr/sbin/rockd
	$(INSTALL) -D -m 0755 $(@D)/rockctl $(TARGET_DIR)/usr/bin/rockctl
	$(INSTALL) -D -m 0755 $(@D)/rocktest $(TARGET_DIR)/usr/libexec/rocktest
endef

$(eval $(generic-package))
