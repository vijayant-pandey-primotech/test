/*!

=========================================================
* Argon Dashboard React - v1.2.4
=========================================================

* Product Page: https://www.creative-tim.com/product/argon-dashboard-react
* Copyright 2024 Creative Tim (https://www.creative-tim.com)
* Licensed under MIT (https://github.com/creativetimofficial/argon-dashboard-react/blob/master/LICENSE.md)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from 'react-toastify';
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  FormGroup,
  Form,
  Input,
  InputGroupAddon,
  InputGroupText,
  InputGroup,
  Row,
  Col,
  Alert,
} from "reactstrap";
import authService from "services/authService";
import { encryptPassword, encryptEmail, setAuthTokens } from "utils/authUtils";

const Login = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  useEffect(() => {
    // Check for session expired message
    const sessionExpiredMessage = localStorage.getItem('sessionExpiredMessage');
    if (sessionExpiredMessage) {
      toast.error(sessionExpiredMessage, {
        position: "top-center",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      // Clear the message from localStorage
      localStorage.removeItem('sessionExpiredMessage');
    }
  }, []);

  // Add custom styles for the button
  const buttonStyles = `
    .btn-primary {
      background-color: #3A6D8C !important;
      border-color: #3A6D8C !important;
    }
    .btn-primary:hover {
      background-color: #2d5670 !important;
      border-color: #2d5670 !important;
    }

    /* Input field styles */
    .form-control {
      color: #000000 !important;
    }
    .form-control::placeholder {
      color: #8898aa !important;
    }
    .form-control:focus {
      color: #000000 !important;
    }
    .input-group-alternative .form-control {
      color: #000000 !important;
    }
    .input-group-alternative .form-control::placeholder {
      color: #8898aa !important;
    }
    .input-group-alternative .form-control:focus {
      color: #000000 !important;
    }
  `;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Remove any existing session timeout
      localStorage.removeItem("sessionTimeOut");

      // Encrypt password
      const encryptedPassword = encryptPassword(formData.password);

      // Make API call
      const response = await authService.login({
        email: formData.email,
        password: encryptedPassword,
      });

      if (response.status === 200) {
        const {
          token,
          refreshToken,
          emailAddress,
          is_active,
          firstName,
          lastName,
          roleName
        } = response.data.body;

        if (is_active === 0) {
          setAuthTokens(token);
          navigate("/auth/login");
        } else {
          // Store tokens
          setAuthTokens(token, refreshToken);

          // Encrypt and store email
          const encryptedEmail = encryptEmail(emailAddress);
          localStorage.setItem("userEmail", encryptedEmail);

          // Store admin name
          const adminName = `${firstName} ${lastName}`.trim();
          localStorage.setItem("adminName", adminName);

          // Store role
          localStorage.setItem("userRole", roleName);

          // Navigate to dashboard
          navigate("/admin/user-details");
        }
      }
    } catch (error) {
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        "An error occurred during login";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Col lg="5" md="7">
      <style>{buttonStyles}</style>
      <Card className="bg-secondary shadow border-0">
        <CardBody className="px-lg-5 py-lg-5">
          {error && (
            <Alert color="danger" className="mb-4">
              {error}
            </Alert>
          )}
          <Form role="form" onSubmit={handleSubmit}>
            <FormGroup className="mb-3">
              <InputGroup className="input-group-alternative">
                <InputGroupAddon addonType="prepend">
                  <InputGroupText>
                    <i className="ni ni-email-83" />
                  </InputGroupText>
                </InputGroupAddon>
                <Input
                  placeholder="Email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </InputGroup>
            </FormGroup>
            <FormGroup>
              <InputGroup className="input-group-alternative">
                <InputGroupAddon addonType="prepend">
                  <InputGroupText>
                    <i className="ni ni-lock-circle-open" />
                  </InputGroupText>
                </InputGroupAddon>
                <Input
                  placeholder="Password"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  required
                />
              </InputGroup>
            </FormGroup>
            {/* <div className="custom-control custom-control-alternative custom-checkbox">
              <input
                className="custom-control-input"
                id="customCheckLogin"
                type="checkbox"
              />
              <label className="custom-control-label" htmlFor="customCheckLogin">
                <span className="text-muted">Remember me</span>
              </label>
            </div> */}
            <div className="text-center">
              <Button
                className="my-4"
                color="primary"
                type="submit"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </div>
          </Form>
        </CardBody>
      </Card>
    </Col>
  );
};

export default Login;
