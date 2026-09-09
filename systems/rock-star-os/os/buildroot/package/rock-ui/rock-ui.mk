ROCK_UI_VERSION = 0.3.0
ROCK_UI_SITE = $(BR2_EXTERNAL_ROCK_PATH)/../ui
ROCK_UI_SITE_METHOD = local
ROCK_UI_LICENSE = Proprietary (project license not yet selected)
ROCK_UI_REDISTRIBUTE = NO
ROCK_UI_DEPENDENCIES = cairo freetype json-c host-pkgconf

define ROCK_UI_BUILD_CMDS
	# Local rsync can include newer host binaries and object files. Clean only
	# the package build directory before using the target compiler.
	$(TARGET_MAKE_ENV) $(MAKE) $(TARGET_CONFIGURE_OPTS) -C $(@D) clean
	$(TARGET_MAKE_ENV) $(MAKE) $(TARGET_CONFIGURE_OPTS) -C $(@D)
endef

define ROCK_UI_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m 0755 $(@D)/rock-ui $(TARGET_DIR)/usr/bin/rock-ui
endef

$(eval $(generic-package))
