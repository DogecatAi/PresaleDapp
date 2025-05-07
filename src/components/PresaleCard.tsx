import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, // Ensuring Box is imported here
  Button, Text, Heading, Divider, Stack, Switch,
  Alert, AlertIcon,
  Flex, 
  Input, 
  useToast, 
  Progress,
  HStack,
  VStack,
  Center,
  Spinner,
  Card, // Ensure Card is imported
  CardBody,
  CardFooter,
  CardHeader,
  Link, // Import Link
} from '@chakra-ui/react';
import { ethers } from 'ethers';
import INFAIPresaleABI from '../abi/INFAIPresale.json'; 
import INFAITokenABI from '../abi/INFAIToken.json'; // Updated from IERC20.json

// Chakra-based component definitions
const CardContainer = (props: React.PropsWithChildren<{}>) => <Box maxW="lg" mx="auto" mt={10} p={5} borderWidth="1px" borderRadius="lg" boxShadow="xl" {...props} />;
const CustomInput = (props: any) => <Input {...props} mb={3} />;

// Configuration for Infinaeon Network
const INFINAEON_NETWORK = {
  chainId: '0x668A0', // 420000 in decimal
  chainName: 'Infinaeon',
  nativeCurrency: {
    name: 'ETH',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://rpc.infinaeon.com'],
  blockExplorerUrls: ['https://explorer.infinaeon.com'],
};

// Presale and Token Configuration
const PRESALE_CONTRACT_ADDRESS = '0xc979C705Cb994caD5f67c2D656e96446EE2E30A8';
const INFAI_TOKEN_ADDRESS = '0x8FBc7648832358aC8cd76d705F9746179F9e7BF4';
const PRESALE_CONFIG = {
  rate: 1150, // 1 ETH = 1150 INFAI
  hardCap: '10', // ETH
  softCap: '3', // ETH
  minContribution: '0.0166', // ETH
  maxContribution: '0.16', // ETH
};

// Helper function to truncate addresses
const truncateAddress = (address: string | null | undefined): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Helper function for formatting numbers
const formatNumber = (value: string | number, decimals: number = 2): string => {
  const num = Number(value);
  if (isNaN(num)) return '0.00';
  return num.toFixed(decimals);
};

// Main PresaleCard component
const PresaleCard: React.FC = () => {
  // Wallet states
  const [isWalletInstalled] = useState<boolean>(true);
  const [isWalletConnected, setIsWalletConnected] = useState<boolean>(false);
  const [account, setAccount] = useState<string | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [isOnCorrectNetwork, setIsOnCorrectNetwork] = useState<boolean>(false);

  // Contract states
  const [presaleContract, setPresaleContract] = useState<ethers.Contract | null>(null);
  const [usdcContract, setUsdcContract] = useState<ethers.Contract | null>(null); // Or your stablecoin
  const [isOwner, setIsOwner] = useState<boolean>(false); // For Admin Panel

  // Presale Data States
  const [totalRaised, setTotalRaised] = useState<string>('0');
  const [tokensSold, setTokensSold] = useState<string>('0');
  const [maxCap, setMaxCap] = useState<string>(PRESALE_CONFIG.hardCap);
  const [userContribution, setUserContribution] = useState<string>('0');
  const [minContribution, setMinContribution] = useState<string>(PRESALE_CONFIG.minContribution);
  const [maxContribution, setMaxContribution] = useState<string>(PRESALE_CONFIG.maxContribution);
  const [presaleActive, setPresaleActive] = useState<boolean>(false);
  const [isClaimActive, setIsClaimActive] = useState<boolean>(false);
  const [tokensClaimable, setTokensClaimable] = useState<string>('0');
  const [emergencyStopActive, setEmergencyStopActive] = useState<boolean>(false);

  // UI states
  const [ethAmount, setEthAmount] = useState<string>('');
  const [tokensToReceive, setTokensToReceive] = useState<string>('0');
  const [loading, setLoading] = useState<boolean>(false);
  const [contributionAmount, setContributionAmount] = useState<string>('');
  const [tokenSymbol, setTokenSymbol] = useState<string>('INFAI'); // Updated to INFAI from memory
  const [presaleRate, setPresaleRate] = useState<number>(PRESALE_CONFIG.rate); // Tokens per ETH/Stablecoin

  // Button loading states
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isContributing, setIsContributing] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);

  const toast = useToast();
  const [copySuccess, setCopySuccess] = useState<string>('');
  const [showTokenAddress, setShowTokenAddress] = useState<boolean>(false);

  // Admin Panel States
  const [adminNewRate, setAdminNewRate] = useState<string>('');
  const [adminNewMinContribution, setAdminNewMinContribution] = useState<string>('');
  const [adminNewMaxContribution, setAdminNewMaxContribution] = useState<string>('');
  const [adminNewMaxCap, setAdminNewMaxCap] = useState<string>('');

  // Effect for handling network/chain changes
  useEffect(() => {
    if ((window as any).ethereum) {
      const handleChainChanged = () => {
        window.location.reload();
      };

      (window as any).ethereum.on('chainChanged', handleChainChanged);

      // Cleanup function to remove the listener when the component unmounts
      return () => {
        (window as any).ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []); // Empty dependency array means this effect runs once on mount and cleans up on unmount

  // Check if on Infinaeon network
  const checkNetwork = useCallback(async (currentProvider: ethers.providers.Web3Provider) => {
    const network = await currentProvider.getNetwork();
    if (network.chainId.toString() === parseInt(INFINAEON_NETWORK.chainId, 16).toString()) {
      setIsOnCorrectNetwork(true);
    } else {
      setIsOnCorrectNetwork(false);
    }
  }, []);

  // Switch to Infinaeon network or add if not present
  const switchToInfinaeonNetwork = useCallback(async (ethereum: any) => {
    if (!ethereum) {
      toast({ title: 'Wallet Error', description: 'MetaMask or a compatible wallet is not installed.', status: 'error', duration: 3000, isClosable: true });
      return;
    }
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: INFINAEON_NETWORK.chainId }],
      });
      setIsOnCorrectNetwork(true); 
    } catch (switchError: any) {
      if (switchError.code === 4902) { 
        try {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [INFINAEON_NETWORK],
          });
          setIsOnCorrectNetwork(true);
        } catch (addError) {
          console.error('Failed to add Infinaeon network:', addError);
          toast({ title: 'Network Error', description: 'Failed to add Infinaeon network.', status: 'error', duration: 3000, isClosable: true });
        }
      } else {
        console.error('Failed to switch network:', switchError);
        toast({ title: 'Network Error', description: 'Failed to switch to Infinaeon network.', status: 'error', duration: 3000, isClosable: true });
      }
    }
  }, [toast]);

  const fetchContractData = useCallback(async (contractInstance?: ethers.Contract, userAddress?: string) => {
    const currentContract = contractInstance || presaleContract;
    const currentAccount = userAddress || account;
    if (!currentContract || !isWalletConnected || !isOnCorrectNetwork || !currentAccount) return;

    try {
      const active = await currentContract.presaleActive();
      setPresaleActive(active);
      const raised = await currentContract.totalRaised();
      setTotalRaised(ethers.utils.formatEther(raised));
      const ownerAddress = await currentContract.owner();
      setIsOwner(ownerAddress.toLowerCase() === currentAccount.toLowerCase());
      const claimable = await currentContract.tokensClaimable();
      setIsClaimActive(claimable);
      const emergency = await currentContract.emergencyStop();
      setEmergencyStopActive(emergency);
      const rate = await currentContract.rate();
      setPresaleRate(parseFloat(ethers.utils.formatUnits(rate, 0))); // If rate is integer tokens per ETH
    } catch (error) {
      console.error('Error fetching contract data:', error);
      toast({
        title: 'Error Fetching Data',
        description: 'Could not fetch presale data from the contract.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [presaleContract, account, isWalletConnected, isOnCorrectNetwork, toast]); // toast in dependencies

  const fetchUserContribution = useCallback(async (contractInstance?: ethers.Contract, userAddress?: string) => {
    const currentContract = contractInstance || presaleContract;
    const currentAccount = userAddress || account;
    if (!currentContract || !currentAccount || !isWalletConnected || !isOnCorrectNetwork) return;
    try {
      const contribution = await currentContract.contributions(currentAccount);
      const formattedContribution = ethers.utils.formatEther(contribution);
      setUserContribution(formattedContribution);
      if (parseFloat(formattedContribution) > 0) {
        setShowTokenAddress(true);
      }
    } catch (error) {
      console.error('Error fetching user contribution:', error);
      toast({
        title: 'Error Fetching Contribution',
        description: 'Could not fetch your contribution data.',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  }, [presaleContract, account, isWalletConnected, isOnCorrectNetwork, toast]);

  const handleContributionAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContributionAmount(e.target.value);
  };

  const connectWallet = useCallback(async () => {
    if ((window as any).ethereum) {
      try {
        const web3Provider = new ethers.providers.Web3Provider((window as any).ethereum);
        setProvider(web3Provider);
        await web3Provider.send('eth_requestAccounts', []);
        const currentSigner = web3Provider.getSigner();
        setSigner(currentSigner);
        const currentAccount = await currentSigner.getAddress();
        setAccount(currentAccount);
        setIsWalletConnected(true);
        await checkNetwork(web3Provider);

        const contract = new ethers.Contract(PRESALE_CONTRACT_ADDRESS, INFAIPresaleABI, currentSigner);
        setPresaleContract(contract);
        
        await fetchContractData(contract, currentAccount);
        await fetchUserContribution(contract, currentAccount);

      } catch (error) {
        console.error('Error connecting wallet:', error);
        toast({ title: 'Wallet Error', description: 'Failed to connect wallet.', status: 'error', duration: 3000, isClosable: true });
        setIsWalletConnected(false);
      }
    } else {
      toast({ title: 'Wallet Error', description: 'MetaMask or a compatible wallet is not installed.', status: 'error', duration: 3000, isClosable: true });
    }
  }, [checkNetwork, toast, fetchContractData, fetchUserContribution]); 

  const handleDisconnectWallet = () => {
    setIsWalletConnected(false);
    setAccount(null);
    setSigner(null);
    setProvider(null);
    setPresaleContract(null);
    setIsOnCorrectNetwork(false);
    setIsOwner(false);

    setUserContribution('0');
    setTokensClaimable('0');
    setTokensToReceive('0');
    setContributionAmount('');
    setShowTokenAddress(false);

    setAdminNewRate('');
    setAdminNewMinContribution('');
    setAdminNewMaxContribution('');
    setAdminNewMaxCap('');

    toast({
      title: 'Wallet Disconnected',
      description: 'Your wallet has been disconnected.',
      status: 'info',
      duration: 3000,
      isClosable: true,
    });
  };

  useEffect(() => {
    if ((window as any).ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          handleDisconnectWallet();
        } else {
          setAccount(accounts[0]);
          if (provider) {
            const newSigner = provider.getSigner(accounts[0]);
            setSigner(newSigner);
            const contract = new ethers.Contract(PRESALE_CONTRACT_ADDRESS, INFAIPresaleABI, newSigner);
            setPresaleContract(contract);
            fetchContractData(contract, accounts[0]);
            fetchUserContribution(contract, accounts[0]);
          }
        }
      };

      const handleChainChanged = (_chainId: string) => {
        if(provider) checkNetwork(provider);
      };

      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
      (window as any).ethereum.on('chainChanged', handleChainChanged);

      return () => {
        (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
        (window as any).ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [provider, checkNetwork, fetchContractData, fetchUserContribution, handleDisconnectWallet]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (isWalletConnected && isOnCorrectNetwork && presaleContract && account) {
      fetchContractData(); 
      fetchUserContribution(); 
      intervalId = setInterval(() => {
        fetchContractData();
        fetchUserContribution();
      }, 30000); 
    }
    return () => clearInterval(intervalId);
  }, [isWalletConnected, isOnCorrectNetwork, presaleContract, account, fetchContractData, fetchUserContribution]);

  const calculateTokens = (inputEthAmount: string): string => {
    if (!inputEthAmount || isNaN(parseFloat(inputEthAmount))) {
      return '0';
    }
    const eth = parseFloat(inputEthAmount);
    const tokens = eth * presaleRate;
    return formatNumber(tokens, 2); 
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*\.?\d*$/.test(value)) {
      setEthAmount(value);
      setTokensToReceive(calculateTokens(value));
    }
  };
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess('Copied!');
      setTimeout(() => setCopySuccess(''), 1500);
    }, (err) => {
      console.error('Could not copy text: ', err);
      toast({ title: 'Copy Failed', description: 'Could not copy address.', status: 'error', duration: 2000, isClosable: true });
    });
  };

  const handleContribute = async () => {
    if (!isWalletConnected || !signer || !presaleContract || !provider) {
      toast({ title: 'Error', description: 'Wallet not connected or contract not loaded.', status: 'error', duration: 3000, isClosable: true });
      return;
    }
    if (!presaleActive) {
      toast({ title: 'Presale Inactive', description: 'The presale is currently not active.', status: 'warning', duration: 3000, isClosable: true });
      return;
    }
    if (emergencyStopActive) {
      toast({ title: 'Presale Paused', description: 'The presale is temporarily paused by admin.', status: 'warning', duration: 3000, isClosable: true });
      return;
    }

    console.log(`[Debug] contributionAmount (string input): '${contributionAmount}'`); // DEBUG - New variable
    const amountInEth = parseFloat(contributionAmount);
    console.log(`[Debug] amountInEth (parsed float): ${amountInEth}`); // DEBUG - New variable

    if (isNaN(amountInEth) || amountInEth <= 0) {
      toast({ title: 'Invalid Amount', description: 'Please enter a valid amount of ETH.', status: 'error', duration: 3000, isClosable: true });
      return;
    }
    if (amountInEth < parseFloat(minContribution) || amountInEth > parseFloat(maxContribution)) {
      toast({ title: 'Contribution Limit', description: `Amount must be between ${minContribution} and ${maxContribution} ETH.`, status: 'error', duration: 3000, isClosable: true });
      return;
    }

    setLoading(true);
    try {
      const tx = await presaleContract.buyTokensWithETH({ value: ethers.utils.parseEther(contributionAmount) });
      toast({ title: 'Transaction Sent', description: 'Waiting for confirmation...', status: 'info', duration: 5000, isClosable: true });
      await tx.wait();
      toast({ title: 'Contribution Successful!', description: `You contributed ${contributionAmount} ETH.`, status: 'success', duration: 5000, isClosable: true });
      fetchContractData();
      fetchUserContribution();
      setContributionAmount(''); // Clear the correct input state
      setTokensToReceive('0'); // Assuming this is still relevant
      setShowTokenAddress(true); 

      // ---- ADD TOKEN TO WALLET LOGIC ----
      if ((window as any).ethereum) {
        try {
          const wasAdded = await (window as any).ethereum.request({
            method: 'wallet_watchAsset',
            params: {
              type: 'ERC20', // Initially only supports ERC20, but other token types may be added.
              options: {
                address: INFAI_TOKEN_ADDRESS, // The address of the token.
                symbol: tokenSymbol,          // A ticker symbol or shorthand, up to 5 characters.
                decimals: 18,                 // The number of decimals in the token.
                image: 'https://postimg.cc/759Gk9z3', // A string url of the token logo.
              },
            },
          });

          if (wasAdded) {
            toast({ title: `${tokenSymbol} Added`, description: `${tokenSymbol} has been added to your MetaMask.`, status: 'info', duration: 3000, isClosable: true });
          } else {
            // User may have declined or already added it. No strong need for a toast here unless an error occurred.
            // console.log('User chose not to add the token or it was already added.');
          }
        } catch (error) {
          console.error('Failed to add token to MetaMask:', error);
          // Don't show a toast for this error as it might be intrusive if they decline or if there's a minor issue.
          // toast({ title: 'Add Token Failed', description: `Could not add ${tokenSymbol} to MetaMask. You can add it manually.`, status: 'warning', duration: 3000, isClosable: true });
        }
      }
      // ---- END ADD TOKEN TO WALLET LOGIC ----

    } catch (error: any) {
      console.error('Contribution error:', error);
      const errorMessage = error.reason || error.message || 'Transaction failed.';
      toast({ title: 'Contribution Failed', description: errorMessage, status: 'error', duration: 5000, isClosable: true });
    } finally {
      setLoading(false);
    }
  };

  const renderMainContent = () => {
    if (isWalletConnected && !isOnCorrectNetwork) {
      return (
        <Alert status="error" mt={4} mb={4}>
          <AlertIcon />
          <Box flex="1">
            <Text fontWeight="bold">Wrong Network</Text>
            <Text>Please switch to the Infinaeon network in your wallet to interact with the presale.</Text>
          </Box>
          <Button 
            colorScheme="orange" 
            size="sm" 
            onClick={async () => await switchToInfinaeonNetwork((window as any).ethereum)}
          >
            Switch to Infinaeon
          </Button>
        </Alert>
      );
    }

    if (isWalletConnected && isOnCorrectNetwork) {
      return (
        <VStack spacing={6} align="stretch" mt={4}>
          <Text textAlign="center" fontSize="lg">Your Wallet: {truncateAddress(account || '')}</Text>

          <Box p={5} borderWidth="1px" borderRadius="lg" shadow="md">
            <Heading size="md" mb={5} textAlign="center">Join the {tokenSymbol} Presale!</Heading>
            
            <VStack spacing={3} align="stretch" mb={5}>
              <HStack justifyContent="space-between">
                <Text>Total Raised:</Text>
                <Text fontWeight="bold">{formatNumber(totalRaised)} ETH / {formatNumber(maxCap)} ETH</Text>
              </HStack>
              <Progress 
                value={(parseFloat(maxCap) > 0 ? (parseFloat(totalRaised) / parseFloat(maxCap)) * 100 : 0)} 
                size="md" 
                colorScheme="green" 
                borderRadius="md"
                isAnimated
                hasStripe
              />
              <HStack justifyContent="space-between">
                <Text>Tokens Sold:</Text>
                <Text fontWeight="bold">{formatNumber(tokensSold)} {tokenSymbol}</Text>
              </HStack>
              <HStack justifyContent="space-between">
                <Text>Your Contribution:</Text>
                <Text fontWeight="bold">{formatNumber(userContribution)} ETH</Text>
              </HStack>
            </VStack>

            <VStack spacing={4} align="stretch" mt={6}>
              <Text fontSize="md" fontWeight="semibold">Rate: 1 ETH = {formatNumber(presaleRate, 0)} {tokenSymbol}</Text>
              <Text fontSize="sm">Min Contribution: {formatNumber(minContribution)} ETH</Text>
              <Text fontSize="sm">Max Contribution: {formatNumber(maxContribution)} ETH</Text>
              
              <Flex mt={3}>
                <Input
                  placeholder={`Enter ETH (Min ${formatNumber(minContribution)})`}
                  value={contributionAmount}
                  onChange={handleContributionAmountChange}
                  type="number"
                  mr={3}
                  focusBorderColor="teal.500"
                />
                <Button
                  colorScheme="teal"
                  onClick={handleContribute}
                  isLoading={isContributing}
                  disabled={isContributing || !presaleActive || emergencyStopActive || parseFloat(contributionAmount) <= 0 || parseFloat(contributionAmount) < parseFloat(minContribution) || parseFloat(contributionAmount) > parseFloat(maxContribution)}
                >
                  Contribute
                </Button>
              </Flex>
              {parseFloat(contributionAmount) > 0 && presaleRate > 0 && (
                <Text fontSize="xs" mt={1} textAlign="right" color="gray.600">
                  You will receive approx: {formatNumber(parseFloat(contributionAmount) * presaleRate, 2)} {tokenSymbol}
                </Text>
              )}
              {emergencyStopActive && <Text color="red.500" textAlign="center" fontWeight="bold" mt={2}>Contributions are temporarily paused.</Text>}
            </VStack>
          </Box>

          {/* Token Claim Section - Shown if claim is active, presale ended, and user contributed */}
          {isClaimActive && !presaleActive && parseFloat(userContribution) > 0 && (
            <Box p={5} borderWidth="1px" borderRadius="lg" shadow="md" mt={6}>
              <Heading size="md" mb={4} textAlign="center">Claim Your {tokenSymbol} Tokens</Heading>
              <Text textAlign="center" mb={3}>You can claim: {formatNumber(tokensClaimable)} {tokenSymbol}</Text>
              <Button 
                colorScheme="blue" 
                onClick={handleContribute} 
                isLoading={isClaiming} 
                width="100%"
                disabled={isClaiming || parseFloat(tokensClaimable) <= 0}
              >
                Claim Tokens
              </Button>
            </Box>
          )}
        </VStack>
      );
    }

    return (
      <Button onClick={connectWallet} isLoading={isConnecting} colorScheme="orange" width="100%" mt={4}>
        Connect Wallet
      </Button>
    );
  };

  // Admin Panel Handlers (Implement actual contract calls)
  const handleAdminSetRate = async () => {
    if (!presaleContract || !signer || !adminNewRate) return;
    setLoading(true);
    try {
      const tx = await presaleContract.setRate(ethers.utils.parseUnits(adminNewRate, 0)); // Assuming rate is an integer without decimals (tokens per ETH)
      await tx.wait();
      toast({ title: 'Admin Action', description: 'Rate updated successfully!', status: 'success', duration: 3000, isClosable: true });
      fetchContractData();
      setAdminNewRate('');
    } catch (error: any) {
      console.error('Error setting rate:', error);
      toast({ title: 'Admin Error', description: error?.data?.message || error.message || 'Failed to set rate.', status: 'error', duration: 5000, isClosable: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSetMinMaxContribution = async () => {
    if (!presaleContract || !signer || !adminNewMinContribution || !adminNewMaxContribution) return;
    setLoading(true);
    try {
      // The ABI does not appear to have a function to set Min/Max contribution.
      // const tx = await presaleContract.setMinMaxContribution(ethers.utils.parseEther(adminNewMinContribution), ethers.utils.parseEther(adminNewMaxContribution));
      // await tx.wait();
      // toast({ title: 'Admin Action', description: 'Min/Max contribution updated successfully!', status: 'success', duration: 3000, isClosable: true });
      // fetchContractData();
      // setAdminNewMinContribution('');
      // setAdminNewMaxContribution('');
      toast({ title: 'Feature Not Available', description: 'The smart contract does not support changing Min/Max contribution limits after deployment.', status: 'warning', duration: 5000, isClosable: true });
    } catch (error: any) {
      console.error('Error setting min/max contribution:', error);
      toast({ title: 'Admin Error', description: error?.data?.message || error.message || 'Failed to set Min/Max contribution.', status: 'error', duration: 5000, isClosable: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSetMaxCap = async () => {
    if (!presaleContract || !signer || !adminNewMaxCap) return;
    setLoading(true);
    try {
      // The ABI does not appear to have a function to set Hard Cap.
      // const tx = await presaleContract.setHardCap(ethers.utils.parseEther(adminNewMaxCap)); // Assuming contract function is setHardCap
      // await tx.wait();
      // toast({ title: 'Admin Action', description: 'Max cap updated successfully!', status: 'success', duration: 3000, isClosable: true });
      // fetchContractData();
      // setAdminNewMaxCap('');
      toast({ title: 'Feature Not Available', description: 'The smart contract does not support changing the Max Cap after deployment.', status: 'warning', duration: 5000, isClosable: true });
    } catch (error: any) {
      console.error('Error setting max cap:', error);
      toast({ title: 'Admin Error', description: error?.data?.message || error.message || 'Failed to set max cap.', status: 'error', duration: 5000, isClosable: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminTogglePresaleStatus = async () => {
    if (!presaleContract || !signer) return;
    setLoading(true);
    try {
      const tx = await presaleContract.togglePresale(); // Corrected function name
      await tx.wait();
      toast({ title: 'Admin Action', description: 'Presale status toggled successfully!', status: 'success', duration: 3000, isClosable: true });
      fetchContractData();
    } catch (error: any) {
      console.error('Error toggling presale status:', error);
      toast({ title: 'Admin Error', description: error?.data?.message || error.message || 'Failed to toggle presale status.', status: 'error', duration: 5000, isClosable: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminToggleClaimStatus = async () => {
    if (!presaleContract || !signer) return;
    setLoading(true);
    try {
      // ABI has enableTokenClaims(). No direct toggle or disable.
      // This will attempt to enable claims. If already enabled, behavior depends on contract.
      if (!isClaimActive) { // Only attempt to enable if not already active based on UI state
        const tx = await presaleContract.enableTokenClaims(); // Corrected function name
        await tx.wait();
        toast({ title: 'Admin Action', description: 'Token claims enabled successfully!', status: 'success', duration: 3000, isClosable: true });
        fetchContractData(); // Refresh data to update isClaimActive state
      } else {
        toast({ title: 'Admin Info', description: 'Claims are already active. Contract does not support disabling claims via this function.', status: 'info', duration: 5000, isClosable: true });
      }
    } catch (error: any) {
      console.error('Error managing claim status:', error);
      toast({ title: 'Admin Error', description: error?.data?.message || error.message || 'Failed to manage claim status.', status: 'error', duration: 5000, isClosable: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminWithdrawFunds = async () => {
    if (!presaleContract || !signer) return;
    setLoading(true);
    try {
      const tx = await presaleContract.withdrawFunds(); 
      await tx.wait();
      toast({ title: 'Admin Action', description: 'Funds withdrawn successfully!', status: 'success', duration: 3000, isClosable: true });
      fetchContractData();
    } catch (error: any) {
      console.error('Error withdrawing funds:', error);
      toast({ title: 'Admin Error', description: error?.data?.message || error.message || 'Failed to withdraw funds.', status: 'error', duration: 5000, isClosable: true });
    } finally {
      setLoading(false);
    }
  };

  const handleAdminToggleEmergencyStop = async () => {
    if (!presaleContract || !signer) return;
    setLoading(true);
    try {
      const tx = await presaleContract.toggleEmergencyStop(); // Assuming this function exists
      await tx.wait();
      toast({ title: 'Admin Action', description: 'Emergency stop status toggled successfully!', status: 'success', duration: 3000, isClosable: true });
      fetchContractData();
    } catch (error: any) {
      console.error('Error toggling emergency stop:', error);
      toast({ title: 'Admin Error', description: error?.data?.message || error.message || 'Failed to toggle emergency stop.', status: 'error', duration: 5000, isClosable: true });
    } finally {
      setLoading(false);
    }
  };

  // Main component render
  return (
    <Card
      p={5}
      shadow="xl"
      borderWidth="1px"
      borderRadius="xl"
      bg="rgba(255, 255, 255, 0.9)" // Changed to 90% opaque white
      maxWidth={{ base: '90%', md: '600px' }}
      width="100%"
      position="relative"
    >
      <CardHeader>
        <Flex align="center" justify="space-between" width="100%"> 
          <Heading size="lg" color="teal.600" textAlign="center" flexGrow={1}>{tokenSymbol} Token Presale</Heading>
          {account && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleDisconnectWallet}
              title="Disconnect Wallet"
              ml={2}
            >
              Disconnect: {truncateAddress(account)}
            </Button>
          )}
        </Flex>
      </CardHeader>

      <CardBody>
        {renderMainContent()}
        {isOwner && (
          <Box p={5} borderWidth="1px" borderRadius="lg" shadow="md" mt={8} borderColor="purple.300">
            <Heading size="lg" mb={6} textAlign="center" color="purple.600">Admin Panel</Heading>
            <VStack spacing={5} align="stretch">
              {/* Set Rate */}
              <Flex as="form" onSubmit={(e) => { e.preventDefault(); handleAdminSetRate(); }}>
                <Input placeholder={`New Rate (current: ${formatNumber(presaleRate,0)} ${tokenSymbol}/ETH)`} value={adminNewRate} onChange={(e) => setAdminNewRate(e.target.value)} type="number" mr={3} focusBorderColor="purple.500"/>
                <Button type="submit" colorScheme="purple" variant="outline" isLoading={loading}>
                  Set Rate
                </Button>
              </Flex>

              {/* Set Min/Max Contribution */}
              <Flex as="form" onSubmit={(e) => { e.preventDefault(); handleAdminSetMinMaxContribution(); }}>
                <Input placeholder={`New Min ETH (current: ${formatNumber(minContribution)})`} value={adminNewMinContribution} onChange={(e) => setAdminNewMinContribution(e.target.value)} type="number" mr={2} focusBorderColor="purple.500"/>
                <Input placeholder={`New Max ETH (current: ${formatNumber(maxContribution)})`} value={adminNewMaxContribution} onChange={(e) => setAdminNewMaxContribution(e.target.value)} type="number" mr={3} focusBorderColor="purple.500"/>
                <Button type="submit" colorScheme="purple" variant="outline" isLoading={loading}>
                  Set Min/Max
                </Button>
              </Flex>

              {/* Set Max Cap */}
              <Flex as="form" onSubmit={(e) => { e.preventDefault(); handleAdminSetMaxCap(); }}>
                <Input placeholder={`New Max Cap ETH (current: ${formatNumber(maxCap)})`} value={adminNewMaxCap} onChange={(e) => setAdminNewMaxCap(e.target.value)} type="number" mr={3} focusBorderColor="purple.500"/>
                <Button type="submit" colorScheme="purple" variant="outline" isLoading={loading}>
                  Set Max Cap
                </Button>
              </Flex>

              <HStack spacing={4} mt={3} justifyContent="space-around">
                <Button onClick={handleAdminTogglePresaleStatus} colorScheme={presaleActive ? "yellow" : "green"} variant="solid" isLoading={loading}>
                  {presaleActive ? 'Deactivate Presale' : 'Activate Presale'}
                </Button>
                <Button onClick={handleAdminToggleClaimStatus} colorScheme={isClaimActive ? "yellow" : "blue"} variant="solid" isLoading={loading}>
                  {isClaimActive ? 'Deactivate Claims' : 'Activate Claims'}
                </Button>
              </HStack>
              
              <Button onClick={handleAdminWithdrawFunds} colorScheme="red" mt={3} variant="solid" width="100%" isLoading={loading}>
                Withdraw Raised Funds
              </Button>
              {emergencyStopActive !== undefined && (
                 <Button 
                    onClick={handleAdminToggleEmergencyStop}
                    colorScheme={emergencyStopActive ? "green" : "red"} 
                    mt={2}
                    variant="solid"
                    width="100%"
                    isLoading={loading}
                  >
                    {emergencyStopActive ? 'DISABLE Emergency Stop' : 'ENABLE Emergency Stop'}
                  </Button>
              )}
            </VStack>
          </Box>
        )}
      </CardBody>

      <CardFooter>
        <VStack spacing={3} width="100%">
          <Text fontSize="xs" color="gray.500" textAlign="center">
            All contributions are final. Please ensure you are sending funds from a wallet you control.
            Always verify the contract address before interacting.
          </Text>
          <Text fontSize="xs" color="gray.500" textAlign="center">
            Contract: {truncateAddress(PRESALE_CONTRACT_ADDRESS)}
          </Text>
        </VStack>
      </CardFooter>
    </Card>
  );
};

export default PresaleCard;
